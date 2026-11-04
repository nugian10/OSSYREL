const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { CLASSES, PRICES, deployFixture } = require("./helpers");

describe("OSSYREL — access control & reentrancy", function () {
  it("only the MintController (MINTER_ROLE) can mint NFTs", async function () {
    const { userA, nft } = await loadFixture(deployFixture);
    await expect(nft.connect(userA).mint(userA.address, CLASSES.BRONZE)).to.be.revertedWithCustomError(
      nft,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("only the MintController (RECORDER_ROLE) can record shares in the engine", async function () {
    const { userA, engine } = await loadFixture(deployFixture);
    await expect(engine.connect(userA).recordMint(100)).to.be.revertedWithCustomError(
      engine,
      "NotRecorder"
    );
  });

  it("only MINTER_ROLE can mint OSR; the deployer holds no minter role by default", async function () {
    const { owner, userA, token } = await loadFixture(deployFixture);
    await expect(token.connect(userA).mint(userA.address, 100)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
    await expect(token.connect(owner).mint(owner.address, 100)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("only the NFT contract can call settleTransfer", async function () {
    const { userA, rewardController } = await loadFixture(deployFixture);
    await expect(
      rewardController.connect(userA).settleTransfer(userA.address, userA.address, 1, 10)
    ).to.be.revertedWithCustomError(rewardController, "OnlyNFT");
  });

  it("only the admin can pause, set revenue, set baseURI, or change wiring", async function () {
    const { userA, owner, nft, mintController, rewardController, engine, token } = await loadFixture(deployFixture);
    await expect(mintController.connect(userA).pause()).to.be.revertedWithCustomError(
      mintController,
      "AccessControlUnauthorizedAccount"
    );
    await expect(
      mintController.connect(userA).setRevenue(userA.address)
    ).to.be.revertedWithCustomError(mintController, "AccessControlUnauthorizedAccount");
    await expect(nft.connect(userA).setBaseURI("https://evil.example/")).to.be.revertedWithCustomError(
      nft,
      "AccessControlUnauthorizedAccount"
    );
    await expect(
      rewardController.connect(userA).setEngine(engine)
    ).to.be.revertedWithCustomError(rewardController, "AccessControlUnauthorizedAccount");
    await expect(rewardController.connect(userA).pause()).to.be.revertedWithCustomError(
      rewardController,
      "AccessControlUnauthorizedAccount"
    );
    // Admin can do all of the above.
    await nft.connect(owner).setBaseURI("https://new.example/meta/");
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    expect(await nft.tokenURI(1)).to.equal("https://new.example/meta/1.json");
  });

  it("OSR hard cap: minting above 1,000,000,000 OSR reverts", async function () {
    const { owner, token } = await loadFixture(deployFixture);
    // Give the owner a temporary minter role to probe the cap directly.
    await token.grantRole(await token.MINTER_ROLE(), owner.address);
    // 300M reserve already exists; 700M more reaches the cap exactly.
    await token.mint(owner.address, ethers.parseEther("700000000"));
    expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000000"));
    await expect(token.mint(owner.address, 1)).to.be.revertedWithCustomError(token, "ERC20ExceededCap");
    await token.revokeRole(await token.MINTER_ROLE(), owner.address);
  });

  it("reentrancy: a malicious revenue contract cannot re-enter mint during payment forwarding", async function () {
    const { owner, nft, engine } = await loadFixture(deployFixture);

    // Attacker contract is the revenue address of a fresh MintController.
    const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
    const MintController = await ethers.getContractFactory("OSSYRELMintController");
    // Deploy attacker first with a placeholder, then the controller, then re-point:
    // simpler — deploy controller with the owner as revenue, then deploy the
    // attacker pointing at the controller, then setRevenue(attacker).
    const mintController = await MintController.deploy(nft, engine, owner.address);
    const attacker = await Attacker.deploy(mintController);
    await mintController.setRevenue(attacker);

    // The NFT must allow this controller to mint too.
    await nft.grantRole(await nft.MINTER_ROLE(), mintController);
    await engine.grantRole(await engine.RECORDER_ROLE(), mintController);

    const supplyBefore = await nft.totalSupply();
    await attacker.attackMint({ value: PRICES[CLASSES.BRONZE] });

    // The re-entrant mint was blocked by ReentrancyGuard...
    expect(await attacker.reentryBlocked()).to.equal(true);
    expect(await attacker.reentryAttempts()).to.equal(1);
    // ...and exactly ONE NFT was minted by the outer call.
    expect(await nft.totalSupply()).to.equal(supplyBefore + 1n);
    // The attacker (revenue) received the payment exactly once.
    expect(await ethers.provider.getBalance(attacker)).to.equal(PRICES[CLASSES.BRONZE]);
  });

  it("no retroactive rewards: accrual starts at mint, not at deployment", async function () {
    const { userA, rewardController, mintController } = await loadFixture(deployFixture);
    const { time } = require("@nomicfoundation/hardhat-network-helpers");

    // 30 days pass with no NFTs minted anywhere.
    await time.increase(30 * 24 * 3600);
    expect(await rewardController.pendingReward(userA.address)).to.equal(0);
    await expect(rewardController.connect(userA).claim()).to.be.revertedWithCustomError(
      rewardController,
      "NothingToClaim"
    );

    // Mint now: the clock starts at mint, the previous 30 days earn nothing.
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    expect(await rewardController.pendingReward(userA.address)).to.equal(0);
  });
});
