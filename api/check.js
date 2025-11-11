const { ethers } = require("ethers");
// Read ABIs from project root
const REFERRAL_ABI = require("../referral_abi.json");
const SUBSCRIPTION_ABI = require("../subscription_abi.json"); 

// Define all 5 networks information here
const NETWORKS = [
    {
        name: "Linea",
        rpc_url: "https://rpc.linea.build",
        reward_contract: "0xB78F9d52405DcF40D6fC684032fDaf658dA67725",
        subscribe_contract: "0xa4D4ab44e4946ecD3849530eFa0161adf33bba1F"
    },
    {
        name: "Arbitrum",
        rpc_url: "https://arb1.arbitrum.io/rpc",
        reward_contract: "0xAd2969f87Def708FE5BaCbA4662a9e704dE8cdC4",
        subscribe_contract: "0xdA801fd8dA4A22AAEa61195b9E91fA239B15Cc4f"
    },
    {
        name: "Ethereum",
        rpc_url: "https://1rpc.io/eth",
        reward_contract: "0xDFe1AF29E0Acfe73D61374619091A11582E56696",
        subscribe_contract: "0x743dEdBBd87E467FCD7f793a9181Ee0F4B942CdE"
    },
    {
        name: "Base",
        rpc_url: "https://bsc.drpc.org",
        reward_contract: "0xf7523828D4934F468F23A2AECdB1D7CA224E8d38",
        subscribe_contract: "0xa9CF64F158D7D9445555c73D89FfA700397c7d64"
    },
    {
        name: "BSC",
        rpc_url: "https://1rpc.io/bnb",
        reward_contract: "0xBf67C207031B0Bdc8f64265B885ffAe95C2076d9",
        subscribe_contract: "0xAd1f5252AD29da8eE60956B5B534ab8d22f7B655"
    }
];

// Helper function to check referral code on a single network
// Returns the referral code if exists, "" on error or empty
async function checkReferralCode(network, userAddress) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(network.rpc_url);
        const contract = new ethers.Contract(network.reward_contract, REFERRAL_ABI, provider);
        const referralCode = await contract.getReferralCode(userAddress);
        return referralCode;
    } catch (error) {
        console.warn(`Error checking referral on ${network.name} for ${userAddress}:`, error.message);
        // If an error occurred (e.g., RPC was down), return an empty string
        return "";
    }
}

// Helper function to check subscription on a single network
// Returns true if has subscription, false otherwise
async function checkSubscription(network, userAddress) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(network.rpc_url);
        const contract = new ethers.Contract(network.subscribe_contract, SUBSCRIPTION_ABI, provider);
        const hasSubscription = await contract.hasSubscription(userAddress);
        return hasSubscription;
    } catch (error) {
        console.warn(`Error checking subscription on ${network.name} for ${userAddress}:`, error.message);
        // If an error occurred, return false
        return false;
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

    // 1. Read user address and check type from URL
    const { address, type } = req.query;

    if (!address || !ethers.utils.isAddress(address)) {
        return res.status(400).json({ error: "A valid address is required" });
    }

    // Determine check type: 'referral' or 'subscription'
    const checkType = type || 'referral'; // Default to referral if not specified

    try {
        if (checkType === 'subscription') {
            // Check subscription across all networks
            const promises = NETWORKS.map(network => checkSubscription(network, address));
            const results = await Promise.allSettled(promises);

            // If subscription is active on ANY network, return 1
            let hasSubscription = false;
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value === true) {
                    hasSubscription = true;
                    break; // No need to check remaining networks
                }
            }

            // Return 1 if has subscription, 0 otherwise
            res.status(200).json({ score: hasSubscription ? 1 : 0 });

        } else {
            // Check referral code (default behavior)
            // Check all 5 networks in parallel (simultaneously)
            const promises = NETWORKS.map(network => checkReferralCode(network, address));
            const results = await Promise.allSettled(promises);

            let activeNetworksCount = 0;

            // Count networks with active referral codes
            for (const result of results) {
                // Promise.allSettled ensures that even if one RPC fails, the rest continue
                if (result.status === 'fulfilled' && result.value !== "") {
                    activeNetworksCount++;
                }
            }

            // Return the count of networks with active referral codes (0-5)
            res.status(200).json({ score: activeNetworksCount });
        }

    } catch (error) {
        console.error("Main API error:", error);
        res.status(500).json({ score: 0 }); // In case of internal error
    }
};