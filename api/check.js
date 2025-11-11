const { ethers } = require("ethers");
// Read ABI from abi.json file which is in the project root
const CONTRACT_ABI = require("../abi.json"); 

// Define all 5 networks information here
const NETWORKS = [
    {
        name: "Linea",
        rpc_url: "https://rpc.linea.build",
        contract_address: "0xB78F9d52405DcF40D6fC684032fDaf658dA67725"
    },
    {
        name: "Arbitrum",
        rpc_url: "https://arb1.arbitrum.io/rpc",
        contract_address: "0xAd2969f87Def708FE5BaCbA4662a9e704dE8cdC4"
    },
    {
        name: "Ethereum",
        rpc_url: "https://1rpc.io/eth",
        contract_address: "0xDFe1AF29E0Acfe73D61374619091A11582E56696"
    },
    {
        name: "Base",
        rpc_url: "https://bsc.drpc.org",
        contract_address: "0xf7523828D4934F468F23A2AECdB1D7CA224E8d38"
    },
    {
        name: "BSC",
        rpc_url: "https://1rpc.io/bnb",
        contract_address: "0xBf67C207031B0Bdc8f64265B885ffAe95C2076d9"
    }
];

// Helper function to check a single network
// Returns "" on error or empty
async function checkNetwork(network, userAddress) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(network.rpc_url);
        const contract = new ethers.Contract(network.contract_address, CONTRACT_ABI, provider);
        const referralCode = await contract.getReferralCode(userAddress);
        return referralCode;
    } catch (error) {
        console.warn(`Error checking ${network.name} for ${userAddress}:`, error.message);
        // If an error occurred (e.g., RPC was down), return an empty string
        return "";
    }
}

// Main Vercel API function
module.exports = async (req, res) => {
    // Set CORS headers for Galxe - check origin and allow if it's from Galxe domains
    const allowedOrigins = [
        'https://galxe.com',
        'https://app.galxe.com',
        'https://dashboard.galxe.com'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // Allow all origins as fallback (you can remove this if you want strict control)
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. Read user address from URL
    const { address } = req.query;

    if (!address || !ethers.utils.isAddress(address)) {
        return res.status(400).json({ error: "A valid address is required" });
    }

    try {
        // 2. Check all 5 networks in parallel (simultaneously)
        const promises = NETWORKS.map(network => checkNetwork(network, address));
        const results = await Promise.allSettled(promises);

        let hasRegisteredCode = false;

        // 3. Check the results
        for (const result of results) {
            // Promise.allSettled ensures that even if one RPC fails, the rest continue
            if (result.status === 'fulfilled' && result.value !== "") {
                // As soon as we find the first referral code in any network
                hasRegisteredCode = true;
                break; // No need to check the remaining networks
            }
        }

        // 4. Return the result as a number (0 or 1) to Galaxy
        if (hasRegisteredCode) {
            // If it had a code
            res.status(200).json({ score: 1 });
        } else {
            // If it had no code in any network
            res.status(200).json({ score: 0 });
        }

    } catch (error) {
        console.error("Main API error:", error);
        res.status(500).json({ score: 0 }); // In case of internal error
    }
};