const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { CLASSES, PRICES, SHARES, deployFixture, mintMany } = require("./helpers");

describe("OSSYREL — minting rules", function () {
  it("mints each class at the exact price and forwards BNB to revenue", async function () {
    const { userA, revenue, nft, mintController, engine, rewardController } = await loadFixture(deployFixture);

    await expect(
      mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] })
    ).to.changeEtherBalances(
      [userA, revenue],
      [PRICES[CLASSES.BRONZE] * -1n, PRICES[CLASSES.BRONZE]]
    );

    // Controller never holds funds.
    expect(await ethers.provider.getBalance(mintController)).to.equal(0);
    expect(await nft.totalSupply()).to.equal(1);
    expect(await engine.totalShares()).to.equal(SHARES[CLASSES.BRONZE]);
    expect(await rewardController.sharesOf(userA.address)).to.equal(SHARES[CLASSES.BRONZE]);

    // Overpaying is accepted and fully forwarded to revenue.
    await expect(
      mintController.connect(userA).mint(CLASSES.SILVER, { value: ethers.parseEther("0.001") })
    ).to.changeEtherBalance(revenue, ethers.parseEther("0.001"));
  });

  it("reverts when paying less than the class price", async function () {
    const { userA, mintController } = await loadFixture(deployFixture);
    for (const classId of [CLASSES.BRONZE, CLASSES.SILVER, CLASSES.GOLD, CLASSES.DIAMOND]) {
      await expect(
        mintController.connect(userA).mint(classId, { value: PRICES[classId] - 1n })
      ).to.be.revertedWithCustomError(mintController, "InsufficientPayment");
    }
    // Paying zero for a paid class also reverts.
    await expect(mintController.connect(userA).mint(CLASSES.DIAMOND)).to.be.revertedWithCustomError(
      mintController,
      "InsufficientPayment"
    );
  });

  it("STARTER is free but limited to 1 per wallet, forever", async function () {
    const { userA, userB, nft, mintController } = await loadFixture(deployFixture);

    await mintController.connect(userA).mint(CLASSES.STARTER); // 0 BNB
    expect(await nft.balanceOf(userA.address)).to.equal(1);
    expect(await mintController.hasStarterMinted(userA.address)).to.equal(true);

    // Same wallet cannot mint a second STARTER.
    await expect(mintController.connect(userA).mint(CLASSES.STARTER)).to.be.revertedWithCustomError(
      mintController,
      "StarterLimitReached"
    );

    // A different wallet can still mint its one STARTER.
    await mintController.connect(userB).mint(CLASSES.STARTER);
    expect(await nft.balanceOf(userB.address)).to.equal(1);

    // Transferring the STARTER away does NOT reset the limit.
    await nft.connect(userA).transferFrom(userA.address, userB.address, 1);
    await expect(mintController.connect(userA).mint(CLASSES.STARTER)).to.be.revertedWithCustomError(
      mintController,
      "StarterLimitReached"
    );
  });

  it("paid classes have no per-wallet limit", async function () {
    const { userA, nft, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.DIAMOND, { value: PRICES[CLASSES.DIAMOND] });
    await mintController.connect(userA).mint(CLASSES.DIAMOND, { value: PRICES[CLASSES.DIAMOND] });
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    expect(await nft.balanceOf(userA.address)).to.equal(3);
  });

  it("total hash rate and shares accumulate correctly per owner", async function () {
    const { userA, nft, engine, rewardController, mintController } = await loadFixture(deployFixture);
    await mintController.connect(userA).mint(CLASSES.STARTER); // 10 MH/s, 1 share
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] }); // 100, 10
    await mintController.connect(userA).mint(CLASSES.GOLD, { value: PRICES[CLASSES.GOLD] }); // 500, 50

    expect(await engine.totalShares()).to.equal(61);
    expect(await rewardController.sharesOf(userA.address)).to.equal(61);

    // Hash rate is derivable per token (sum over owned tokens).
    let totalHash = 0n;
    const balance = await nft.balanceOf(userA.address);
    for (let i = 0; i < balance; i++) {
      const tokenId = await nft.tokenOfOwnerByIndex(userA.address, i);
      totalHash += await nft.hashRateOf(tokenId);
    }
    expect(totalHash).to.equal(610);
  });

  it("pausing blocks minting; unpausing restores it (owner only)", async function () {
    const { userA, mintController } = await loadFixture(deployFixture);
    await mintController.pause();
    expect(await mintController.paused()).to.equal(true);
    await expect(
      mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] })
    ).to.be.revertedWithCustomError(mintController, "EnforcedPause");
    await mintController.unpause();
    await mintController.connect(userA).mint(CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    expect(await mintController.paused()).to.equal(false);
  });

  it("agentMint: only AGENT_ROLE can mint on behalf of a user; NFT goes to the user", async function () {
    const { userA, agent, owner, nft, mintController } = await loadFixture(deployFixture);

    // Nobody has AGENT_ROLE yet.
    await expect(
      mintController.connect(agent).agentMint(userA.address, CLASSES.BRONZE, {
        value: PRICES[CLASSES.BRONZE],
      })
    ).to.be.revertedWithCustomError(mintController, "AccessControlUnauthorizedAccount");

    // Owner grants AGENT_ROLE to the agent address.
    await mintController.grantRole(await mintController.AGENT_ROLE(), agent.address);
    await mintController
      .connect(agent)
      .agentMint(userA.address, CLASSES.BRONZE, { value: PRICES[CLASSES.BRONZE] });
    expect(await nft.ownerOf(1)).to.equal(userA.address);
    expect(await nft.balanceOf(agent.address)).to.equal(0);

    // Owner (admin) without AGENT_ROLE still cannot agentMint.
    await expect(
      mintController.connect(owner).agentMint(userA.address, CLASSES.BRONZE, {
        value: PRICES[CLASSES.BRONZE],
      })
    ).to.be.revertedWithCustomError(mintController, "AccessControlUnauthorizedAccount");
  });

  it("enforces the global max supply of 5,000 NFTs", async function () {
    const { userA, nft, mintController } = await loadFixture(deployFixture);
    // Heavy fixture: mint all 5,000 as DIAMOND (150 shares each).
    await mintMany(mintController, userA, CLASSES.DIAMOND, 5000);
    expect(await nft.totalSupply()).to.equal(5000);

    await expect(
      mintController.connect(userA).mint(CLASSES.DIAMOND, { value: PRICES[CLASSES.DIAMOND] })
    ).to.be.revertedWithCustomError(mintController, "MaxSupplyReached");
    await expect(mintController.connect(userA).mint(CLASSES.STARTER)).to.be.revertedWithCustomError(
      mintController,
      "MaxSupplyReached"
    );
  });
});
