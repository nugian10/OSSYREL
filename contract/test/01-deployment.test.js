const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { CLASSES, PRICES, SHARES, HASH_RATE, BASE_URI, deployFixture } = require("./helpers");

describe("OSSYREL — deployment & constants", function () {
  it("deploys all five contracts and wires roles", async function () {
    const { owner, token, engine, nft, mintController, rewardController } = await loadFixture(deployFixture);

    expect(await token.name()).to.equal("OSSYREL");
    expect(await token.symbol()).to.equal("OSR");
    expect(await nft.name()).to.equal("OSSYREL Node");
    expect(await nft.symbol()).to.equal("OSSRN");

    // Wiring checks
    expect(await nft.rewardController()).to.equal(await rewardController.getAddress());
    expect(await nft.hasRole(await nft.MINTER_ROLE(), mintController)).to.equal(true);
    expect(await engine.hasRole(await engine.RECORDER_ROLE(), mintController)).to.equal(true);
    expect(await token.hasRole(await token.MINTER_ROLE(), rewardController)).to.equal(true);
    expect(await rewardController.nft()).to.equal(await nft.getAddress());
    expect(await rewardController.engine()).to.equal(await engine.getAddress());
    expect(await rewardController.token()).to.equal(await token.getAddress());
    expect(await mintController.nft()).to.equal(await nft.getAddress());
    expect(await mintController.engine()).to.equal(await engine.getAddress());

    // Admin is the deployer (owner = My Wallet at real deploy)
    expect(await nft.hasRole(await nft.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
  });

  it("NFT spec constants: max supply 5,000, classes, hash rate, shares", async function () {
    const { nft } = await loadFixture(deployFixture);
    expect(await nft.MAX_SUPPLY()).to.equal(5000);
    for (const [classId, hashRate] of Object.entries(HASH_RATE)) {
      expect(await nft.HASH_RATE(classId)).to.equal(hashRate);
    }
    for (const [classId, shares] of Object.entries(SHARES)) {
      expect(await nft.SHARES(classId)).to.equal(shares);
    }
  });

  it("OSR token spec constants: cap 1B, reserve 300M, mining pool 700M", async function () {
    const { owner, token, rewardController } = await loadFixture(deployFixture);
    expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("1000000000"));
    expect(await token.RESERVE_SUPPLY()).to.equal(ethers.parseEther("300000000"));
    expect(await token.MINING_POOL()).to.equal(ethers.parseEther("700000000"));
    expect(await token.cap()).to.equal(ethers.parseEther("1000000000"));
    // Reserve minted once at deployment to the treasury (owner).
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("300000000"));
    expect(await token.totalSupply()).to.equal(ethers.parseEther("300000000"));
    expect(await rewardController.MINING_POOL()).to.equal(ethers.parseEther("700000000"));
    expect(await rewardController.minedTotal()).to.equal(0);
  });

  it("mint prices are exactly per spec for all five classes", async function () {
    const { mintController } = await loadFixture(deployFixture);
    expect(await mintController.PRICE_STARTER()).to.equal(0);
    expect(await mintController.PRICE_BRONZE()).to.equal(ethers.parseEther("0.0003"));
    expect(await mintController.PRICE_SILVER()).to.equal(ethers.parseEther("0.0007"));
    expect(await mintController.PRICE_GOLD()).to.equal(ethers.parseEther("0.0014"));
    expect(await mintController.PRICE_DIAMOND()).to.equal(ethers.parseEther("0.0042"));
    for (const [classId, price] of Object.entries(PRICES)) {
      expect(await mintController.priceOf(classId)).to.equal(price);
    }
    expect(await mintController.MAX_SUPPLY()).to.equal(5000);
  });

  it("Era engine starts at Era 1 with 10 OSR/share/day and 30d / 150k thresholds", async function () {
    const { engine } = await loadFixture(deployFixture);
    expect(await engine.currentEra()).to.equal(1);
    expect(await engine.ERA_DURATION()).to.equal(30 * 24 * 3600);
    expect(await engine.SHARES_PER_ERA()).to.equal(150000);
    expect(await engine.BASE_REWARD_PER_SHARE_PER_DAY()).to.equal(ethers.parseEther("10"));
    expect(await engine.rewardPerSharePerDay(1)).to.equal(ethers.parseEther("10"));
    expect(await engine.canTransition()).to.equal(false);
    expect(await engine.sharesSinceEraStart()).to.equal(0);
    expect(await engine.totalShares()).to.equal(0);
  });

  it("NFT metadata: baseURI + tokenId.json, class/hashRate/shares per token", async function () {
    const { userA, nft, mintController } = await loadFixture(deployFixture);
    // Mint one of each class (STARTER free, others paid).
    for (const classId of [0, 1, 2, 3, 4]) {
      await mintController.connect(userA).mint(classId, { value: PRICES[classId] });
    }
    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      const classId = tokenId - 1;
      expect(await nft.tokenURI(tokenId)).to.equal(`${BASE_URI}${tokenId}.json`);
      expect(await nft.classOf(tokenId)).to.equal(classId);
      expect(await nft.hashRateOf(tokenId)).to.equal(HASH_RATE[classId]);
      expect(await nft.sharesOfToken(tokenId)).to.equal(SHARES[classId]);
      expect(await nft.ownerOf(tokenId)).to.equal(userA.address);
    }
    expect(await nft.totalSupply()).to.equal(5);
  });

  it("constructor rejects zero addresses", async function () {
    const { owner, token, engine, nft } = await loadFixture(deployFixture);
    const Token = await ethers.getContractFactory("OSSYRELToken");
    await expect(Token.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Token, "ZeroAddress");
    const MintController = await ethers.getContractFactory("OSSYRELMintController");
    await expect(
      MintController.deploy(nft, engine, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(MintController, "ZeroAddress");
    const RewardController = await ethers.getContractFactory("OSSYRELRewardController");
    await expect(
      RewardController.deploy(ethers.ZeroAddress, engine, token)
    ).to.be.revertedWithCustomError(RewardController, "ZeroAddress");
    await expect(nft.setRewardController(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      nft,
      "ZeroAddress"
    );
    expect(owner.address).to.not.equal(ethers.ZeroAddress); // sanity
  });
});
