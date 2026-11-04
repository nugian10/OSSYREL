const { ethers } = require("hardhat");

const CLASSES = { STARTER: 0, BRONZE: 1, SILVER: 2, GOLD: 3, DIAMOND: 4 };
const PRICES = {
  0: 0n,
  1: ethers.parseEther("0.0003"),
  2: ethers.parseEther("0.0007"),
  3: ethers.parseEther("0.0014"),
  4: ethers.parseEther("0.0042"),
};
const SHARES = { 0: 1n, 1: 10n, 2: 25n, 3: 50n, 4: 150n };
const HASH_RATE = { 0: 10n, 1: 100n, 2: 250n, 3: 500n, 4: 1500n };
const BASE_URI = "https://example.com/metadata/";

/// Deploys the full OSSYREL stack and wires all roles (local only).
async function deployFixture() {
  const [owner, userA, userB, agent, revenue] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("OSSYRELToken");
  const token = await Token.deploy(owner.address); // 300M OSR reserve -> owner

  const Engine = await ethers.getContractFactory("OSSYRELMiningEngine");
  const engine = await Engine.deploy();

  const NFT = await ethers.getContractFactory("OSSYRELNodeNFT");
  const nft = await NFT.deploy(BASE_URI);

  const MintController = await ethers.getContractFactory("OSSYRELMintController");
  const mintController = await MintController.deploy(nft, engine, revenue.address);

  const RewardController = await ethers.getContractFactory("OSSYRELRewardController");
  const rewardController = await RewardController.deploy(nft, engine, token);

  // Wiring: roles + reward-settlement hook.
  await nft.grantRole(await nft.MINTER_ROLE(), mintController);
  await engine.grantRole(await engine.RECORDER_ROLE(), mintController);
  await token.grantRole(await token.MINTER_ROLE(), rewardController);
  await nft.setRewardController(rewardController);

  return { owner, userA, userB, agent, revenue, token, engine, nft, mintController, rewardController };
}

/// Mint `count` NFTs of one class from `signer` (sequential txs).
async function mintMany(mintController, signer, classId, count) {
  const price = PRICES[classId];
  for (let i = 0; i < count; i++) {
    await mintController.connect(signer).mint(classId, { value: price });
  }
}

module.exports = { CLASSES, PRICES, SHARES, HASH_RATE, BASE_URI, deployFixture, mintMany };
