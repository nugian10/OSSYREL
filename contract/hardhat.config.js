require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  mocha: {
    // Heavy tests mint up to 5,000 NFTs (max-supply + pool fixtures).
    timeout: 600000,
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // BNB Smart Chain mainnet (chain ID 56).
    // NEVER commit a private key. Set BSC_PRIVATE_KEY in a local .env only.
    // Deploy is intentionally NOT part of this stage; see README.md.
    bsc: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: process.env.BSC_PRIVATE_KEY
        ? [process.env.BSC_PRIVATE_KEY]
        : [],
    },
  },
};
