const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { CLASSES, PRICES, deployFixture } = require("./helpers");

const DAY = 24 * 3600;

describe("OSSYREL — reward accrual & claims", function () {
  it("accrues 10 OSR per share per day in Era 1 (1 BRONZE = 10 shares -> 100 OSR/day)", async function () {
    const { userA, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });

    expect(await rewardController.pendingReward(userA.address)).to.equal(0);
    await time.increase(1 * DAY);
    expect(await rewardController.pendingReward(userA.address)).to.equal(ethers.parseEther("100"));

    await time.increase(2 * DAY);
    expect(await rewardController.pendingReward(userA.address)).to.equal(ethers.parseEther("300"));
  });

  it("claim pays the full pending amount in OSR and resets pending to zero", async function () {
    const { userA, token, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    await time.increase(1 * DAY);

    // View right after the time jump is exact: 100 OSR pending.
    expect(await rewardController.pendingReward(userA.address)).to.equal(ethers.parseEther("100"));

    // The claim tx itself mines ~1s later, so the paid amount is 100 OSR
    // plus ~1 second of accrual; assert within a small tolerance.
    const TOL = ethers.parseEther("0.01");
    await expect(rewardController.connect(userA).claim()).to.emit(rewardController, "Claimed");

    const balance = await token.balanceOf(userA.address);
    expect(balance).to.be.closeTo(ethers.parseEther("100"), TOL);
    expect(await rewardController.pendingReward(userA.address)).to.equal(0);
    expect(await rewardController.totalClaimed(userA.address)).to.equal(balance);
    expect(await rewardController.minedTotal()).to.equal(balance);
    expect(await rewardController.claimCount(userA.address)).to.equal(1);

    const history = await rewardController.getClaimHistory(userA.address);
    expect(history.length).to.equal(1);
    expect(history[0].amount).to.equal(balance);
    expect(history[0].era).to.equal(1);
  });

  it("anti double-claim: a second claim pays only newly accrued rewards, never the same accrual twice", async function () {
    const { userA, token, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    await time.increase(1 * DAY);
    await rewardController.connect(userA).claim();
    const claimedAfterFirst = await token.balanceOf(userA.address);
    expect(claimedAfterFirst).to.be.closeTo(ethers.parseEther("100"), ethers.parseEther("0.01"));

    // A second claim one block later can only pay ~1 second of new accrual
    // (10 shares x 10 OSR/day x 1s ~= 0.001 OSR) — never another 100 OSR.
    await rewardController.connect(userA).claim();
    const claimedAfterSecond = await token.balanceOf(userA.address);
    expect(claimedAfterSecond - claimedAfterFirst).to.be.lt(ethers.parseEther("0.01"));
    expect(await rewardController.pendingReward(userA.address)).to.equal(0);
    expect(await rewardController.claimCount(userA.address)).to.equal(2);
  });

  it("accrual follows halving across Eras (30d @ 10 + 30d @ 5 = 4,500 OSR for 10 shares)", async function () {
    const { userA, engine, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });

    await time.increase(30 * DAY);
    await engine.advanceEra(); // Era 2, rate 5
    expect(await engine.currentEra()).to.equal(2);

    await time.increase(30 * DAY);
    // Era 1: 10 shares x 10 OSR x 30d = 3,000. Era 2: 10 x 5 x 30 = 1,500.
    // Tolerance covers block drift AND the fact that the Era clock starts at
    // engine deployment (a few blocks before the mint), so the user's Era 1
    // segment is a few seconds shorter than a full 30 days.
    const TOL = ethers.parseEther("0.1");
    expect(await rewardController.pendingReward(userA.address)).to.be.closeTo(
      ethers.parseEther("4500"),
      TOL
    );

    await rewardController.connect(userA).claim();
    expect(await rewardController.totalClaimed(userA.address)).to.be.closeTo(
      ethers.parseEther("4500"),
      TOL
    );
  });

  it("transfer settles the old owner up to transfer time; the new owner earns only after", async function () {
    const { userA, userB, nft, token, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });

    await time.increase(1 * DAY);
    // A transfers the NFT to B. Settlement happens inside the transfer.
    await nft.connect(userA).transferFrom(userA.address, userB.address, 1);

    // A settled 100 OSR (+~1s of block drift); B starts from zero.
    const TOL = ethers.parseEther("0.01");
    expect(await rewardController.pendingReward(userA.address)).to.be.closeTo(
      ethers.parseEther("100"),
      TOL
    );
    expect(await rewardController.pendingReward(userB.address)).to.equal(0);
    expect(await rewardController.sharesOf(userA.address)).to.equal(0);
    expect(await rewardController.sharesOf(userB.address)).to.equal(10);

    await time.increase(1 * DAY);
    // A earns nothing more; B earned exactly one day.
    expect(await rewardController.pendingReward(userA.address)).to.be.closeTo(
      ethers.parseEther("100"),
      TOL
    );
    expect(await rewardController.pendingReward(userB.address)).to.equal(ethers.parseEther("100"));

    await rewardController.connect(userA).claim();
    await rewardController.connect(userB).claim();
    expect(await token.balanceOf(userA.address)).to.be.closeTo(ethers.parseEther("100"), TOL);
    expect(await token.balanceOf(userB.address)).to.be.closeTo(ethers.parseEther("100"), TOL);
  });

  it("transferring one of several NFTs settles only that token's shares", async function () {
    const { userA, userB, nft, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] }); // token 1, 10 shares
    await mintController.connect(userA).mint(CLASSES.GOLD, { value: PRICES[CLASSES.GOLD] }); // token 2, 50 shares
    expect(await rewardController.sharesOf(userA.address)).to.equal(60);

    await time.increase(1 * DAY);
    await nft.connect(userA).transferFrom(userA.address, userB.address, 1); // only the BRONZE moves

    expect(await rewardController.sharesOf(userA.address)).to.equal(50);
    expect(await rewardController.sharesOf(userB.address)).to.equal(10);
    // A accrued 60 shares x 10 OSR x 1 day = 600 OSR before the transfer
    // (plus ~seconds of block drift between the mint/transfer blocks).
    const TOL = ethers.parseEther("0.01");
    expect(await rewardController.pendingReward(userA.address)).to.be.closeTo(
      ethers.parseEther("600"),
      TOL
    );
    expect(await rewardController.pendingReward(userB.address)).to.equal(0);

    await time.increase(1 * DAY);
    // A: 600 + 50x10x1 = 1,100. B: 10x10x1 = 100.
    expect(await rewardController.pendingReward(userA.address)).to.be.closeTo(
      ethers.parseEther("1100"),
      TOL
    );
    expect(await rewardController.pendingReward(userB.address)).to.equal(ethers.parseEther("100"));
  });

  it("claimFor: only AGENT_ROLE can claim for a user, and OSR goes to the user", async function () {
    const { userA, agent, token, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    await time.increase(1 * DAY);

    await expect(rewardController.connect(agent).claimFor(userA.address)).to.be.revertedWithCustomError(
      rewardController,
      "AccessControlUnauthorizedAccount"
    );

    await rewardController.grantRole(await rewardController.AGENT_ROLE(), agent.address);
    await rewardController.connect(agent).claimFor(userA.address);
    // ~seconds of block drift between the time jump and the claim tx.
    expect(await token.balanceOf(userA.address)).to.be.closeTo(
      ethers.parseEther("100"),
      ethers.parseEther("0.01")
    );
    expect(await token.balanceOf(agent.address)).to.equal(0);
  });

  it("pausing blocks claims; unpausing restores them (owner only)", async function () {
    const { userA, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    await time.increase(1 * DAY);
    await rewardController.pause();
    await expect(rewardController.connect(userA).claim()).to.be.revertedWithCustomError(
      rewardController,
      "EnforcedPause"
    );
    await rewardController.unpause();
    await rewardController.connect(userA).claim();
    expect(await rewardController.totalClaimed(userA.address)).to.be.closeTo(
      ethers.parseEther("100"),
      ethers.parseEther("0.01")
    );
  });

  it("pool cap: a claim larger than the remaining pool is paid partially, then the pool is empty", async function () {
    // The real pool can never be exhausted under the fixed spec
    // (max 750,000 shares x max 600 OSR/share = 450M < 700M), so this test
    // drives the RewardController with a mock engine at an extreme rate to
    // exercise the cap code path itself.
    const { owner, userA } = await loadFixture(deployFixture);
    const Token = await ethers.getContractFactory("OSSYRELToken");
    const token = await Token.deploy(owner.address);
    const MockEngine = await ethers.getContractFactory("MockMiningEngine");
    const mockEngine = await MockEngine.deploy();
    const MockNFT = await ethers.getContractFactory("MockNFT");
    const mockNft = await MockNFT.deploy();
    const RewardController = await ethers.getContractFactory("OSSYRELRewardController");
    const rewardController = await RewardController.deploy(mockNft, mockEngine, token);
    await token.grantRole(await token.MINTER_ROLE(), rewardController);

    // Extreme rate: 1,000,000 OSR per share per day.
    await mockEngine.setRate(ethers.parseEther("1000000"));
    await mockNft.triggerSettle(rewardController, ethers.ZeroAddress, userA.address, 10);

    await time.increase(1 * DAY);
    await rewardController.connect(userA).claim();
    // ~1s of block drift at the mock's extreme rate (~115 OSR/second).
    const TOL = ethers.parseEther("1000");
    expect(await token.balanceOf(userA.address)).to.be.closeTo(ethers.parseEther("10000000"), TOL);
    expect(await rewardController.minedTotal()).to.be.closeTo(ethers.parseEther("10000000"), TOL);
    expect(await rewardController.remainingPool()).to.be.closeTo(
      ethers.parseEther("690000000"),
      TOL
    );

    // 100 more days -> pending 1,000,000,000 OSR, but only ~690,000,000 remain.
    await time.increase(100 * DAY);
    expect(await rewardController.pendingReward(userA.address)).to.equal(
      ethers.parseEther("1000000000")
    );
    await rewardController.connect(userA).claim();
    // The partial payment tops the pool up to exactly 700,000,000 total.
    expect(await token.balanceOf(userA.address)).to.equal(ethers.parseEther("700000000"));
    expect(await rewardController.minedTotal()).to.equal(ethers.parseEther("700000000"));
    expect(await rewardController.remainingPool()).to.equal(0);
    // Unpaid remainder stays pending but can never be paid.
    expect(await rewardController.pendingReward(userA.address)).to.be.closeTo(
      ethers.parseEther("310000000"),
      TOL
    );
    await expect(rewardController.connect(userA).claim()).to.be.revertedWithCustomError(
      rewardController,
      "PoolEmpty"
    );
  });
});
