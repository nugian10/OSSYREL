const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { CLASSES, PRICES, deployFixture, mintMany } = require("./helpers");

const DAY = 24 * 3600;

describe("OSSYREL — Era transitions & halving", function () {
  it("halving: reward rate is 10 / 5 / 2.5 OSR per share per day for Eras 1/2/3", async function () {
    const { engine } = await loadFixture(deployFixture);
    expect(await engine.rewardPerSharePerDay(1)).to.equal(ethers.parseEther("10"));
    expect(await engine.rewardPerSharePerDay(2)).to.equal(ethers.parseEther("5"));
    expect(await engine.rewardPerSharePerDay(3)).to.equal(ethers.parseEther("2.5"));
    expect(await engine.rewardPerSharePerDay(4)).to.equal(ethers.parseEther("1.25"));
    expect(await engine.rewardPerSharePerDay(5)).to.equal(ethers.parseEther("0.625"));
  });

  it("time trigger: Era advances after 30 days, not before", async function () {
    const { engine } = await loadFixture(deployFixture);
    await time.increase(29 * DAY);
    expect(await engine.canTransition()).to.equal(false);
    await engine.advanceEra();
    expect(await engine.currentEra()).to.equal(1);

    await time.increase(1 * DAY + 1); // 30 days + 1s since Era start
    expect(await engine.canTransition()).to.equal(true);
    await engine.advanceEra();
    expect(await engine.currentEra()).to.equal(2);
    expect(await engine.rewardPerSharePerDay(2)).to.equal(ethers.parseEther("5"));
    expect(await engine.sharesSinceEraStart()).to.equal(0);
  });

  it("time trigger: multiple Eras pass if enough time elapsed (90 days -> Era 4)", async function () {
    const { engine } = await loadFixture(deployFixture);
    await time.increase(90 * DAY + 1);
    await engine.advanceEra();
    expect(await engine.currentEra()).to.equal(4);
    expect(await engine.rewardPerSharePerDay(4)).to.equal(ethers.parseEther("1.25"));
  });

  it("shares trigger: Era advances exactly at 150,000 new shares", async function () {
    const { userA, engine, mintController } = await loadFixture(deployFixture);
    // 999 DIAMOND = 149,850 shares: still Era 1.
    await mintMany(mintController, userA, CLASSES.DIAMOND, 999);
    expect(await engine.totalShares()).to.equal(149850);
    expect(await engine.currentEra()).to.equal(1);
    expect(await engine.canTransition()).to.equal(false);
    expect(await engine.sharesRemainingForEra()).to.equal(150);

    // 1,000th DIAMOND crosses 150,000 shares -> Era 2.
    await mintController.connect(userA).mint(CLASSES.DIAMOND, { value: PRICES[CLASSES.DIAMOND] });
    expect(await engine.totalShares()).to.equal(150000);
    expect(await engine.currentEra()).to.equal(2);
    expect(await engine.sharesSinceEraStart()).to.equal(0);
    expect(await engine.rewardPerSharePerDay(2)).to.equal(ethers.parseEther("5"));
  });

  it("advanceEra is permissionless (anyone may settle a due Era)", async function () {
    const { userA, engine } = await loadFixture(deployFixture);
    await time.increase(30 * DAY + 1);
    // userA is not admin and holds no role.
    await engine.connect(userA).advanceEra();
    expect(await engine.currentEra()).to.equal(2);
  });

  it("nextEraAt / sharesRemainingForEra views are correct", async function () {
    const { userA, engine, mintController } = await loadFixture(deployFixture);
    const start = await engine.eraStart();
    expect(await engine.nextEraAt()).to.equal(start + 30n * 24n * 3600n);
    expect(await engine.sharesRemainingForEra()).to.equal(150000);

    await mintController.connect(userA).mint(CLASSES.DIAMOND, { value: PRICES[CLASSES.DIAMOND] });
    expect(await engine.sharesRemainingForEra()).to.equal(150000 - 150);
  });

  it("eraStartTime history is recorded per Era", async function () {
    const { engine } = await loadFixture(deployFixture);
    const t0 = await engine.eraStartTime(1);
    await time.increase(30 * DAY + 1);
    await engine.advanceEra();
    const t1 = await engine.eraStartTime(2);
    expect(t1).to.equal(t0 + 30n * 24n * 3600n);
    expect(await engine.eraCount()).to.equal(2);
    await expect(engine.eraStartTime(3)).to.be.revertedWith("Era out of range");
    await expect(engine.eraStartTime(0)).to.be.revertedWith("Era out of range");
  });
});
