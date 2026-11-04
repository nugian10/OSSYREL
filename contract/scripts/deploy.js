/* OSSYREL — THE HASH LEDGER: deployment script (LOCAL / TESTNET USE).
 *
 * This script deploys and wires the five contracts. It does NOT deploy to
 * BNB mainnet unless you explicitly set CONFIRM_MAINNET_DEPLOY=true, and
 * even then it needs a funded deployer key in .env (never committed).
 *
 * Intended deployer: the OWNER wallet (My Wallet). Mint payments go to the
 * REVENUE address (Binance Agentic Wallet).
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *
 * DO NOT run this against mainnet until an independent security review of
 * the reward distribution is complete (see contract/README.md).
 */
const hre = require("hardhat");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`\n== OSSYREL deploy | chainId ${chainId} ==`);

  if (chainId === 56 && process.env.CONFIRM_MAINNET_DEPLOY !== "true") {
    throw new Error(
      "Refusing mainnet deploy: set CONFIRM_MAINNET_DEPLOY=true in .env " +
        "only after an independent security review. See contract/README.md."
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer (owner):", deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "BNB");

  const revenue = process.env.REVENUE_ADDRESS || deployer.address;
  const baseURI = process.env.BASE_URI || "https://example.com/metadata/";
  console.log("Revenue (payout):", revenue);
  console.log("Base URI:", baseURI);

  // 1. OSR token — 300M reserve minted to the deployer (treasury/owner).
  const Token = await hre.ethers.getContractFactory("OSSYRELToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  console.log("\nOSSYRELToken (OSR):     ", await token.getAddress());

  // 2. Mining engine — Era clock starts at deployment.
  const Engine = await hre.ethers.getContractFactory("OSSYRELMiningEngine");
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  console.log("OSSYRELMiningEngine:   ", await engine.getAddress());

  // 3. Node NFT.
  const NFT = await hre.ethers.getContractFactory("OSSYRELNodeNFT");
  const nft = await NFT.deploy(baseURI);
  await nft.waitForDeployment();
  console.log("OSSYRELNodeNFT:        ", await nft.getAddress());

  // 4. Mint controller.
  const MintController = await hre.ethers.getContractFactory("OSSYRELMintController");
  const mintController = await MintController.deploy(nft, engine, revenue);
  await mintController.waitForDeployment();
  console.log("OSSYRELMintController: ", await mintController.getAddress());

  // 5. Reward controller.
  const RewardController = await hre.ethers.getContractFactory("OSSYRELRewardController");
  const rewardController = await RewardController.deploy(nft, engine, token);
  await rewardController.waitForDeployment();
  console.log("OSSYRELRewardController:", await rewardController.getAddress());

  // Wiring — roles + settlement hook.
  console.log("\nWiring roles...");
  await (await nft.grantRole(await nft.MINTER_ROLE(), mintController)).wait();
  await (await engine.grantRole(await engine.RECORDER_ROLE(), mintController)).wait();
  await (await token.grantRole(await token.MINTER_ROLE(), rewardController)).wait();
  await (await nft.setRewardController(rewardController)).wait();
  console.log("Wiring done.");

  // Sanity checks (read-only).
  console.log("\nSanity checks:");
  console.log("  NFT max supply:      ", (await nft.MAX_SUPPLY()).toString());
  console.log("  OSR cap:             ", hre.ethers.formatEther(await token.cap()));
  console.log("  OSR reserve balance: ", hre.ethers.formatEther(await token.balanceOf(deployer.address)));
  console.log("  Engine era:          ", (await engine.currentEra()).toString());
  console.log("  Engine rate Era 1:   ", hre.ethers.formatEther(await engine.rewardPerSharePerDay(1)), "OSR/share/day");
  console.log("  Mint price DIAMOND:  ", hre.ethers.formatEther(await mintController.priceOf(4)), "BNB");
  console.log("  NFT rewardController:", await nft.rewardController());
  console.log("\nNEXT STEPS (manual, owner only):");
  console.log("  1. Verify each contract on BscScan (source verification, not an audit).");
  console.log("  2. Grant AGENT_ROLE on MintController/RewardController to the trusted agent address, if used.");
  console.log("  3. Get an INDEPENDENT SECURITY REVIEW before enabling real reward distribution.");
  console.log("  4. Minting is open immediately after deploy (no separate activation step).");
  console.log("     Pause via MintController.pause() / RewardController.pause() in an emergency.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
