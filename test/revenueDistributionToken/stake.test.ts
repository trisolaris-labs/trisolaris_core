/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "../time";

describe("RevenueDistributionToken - Stake", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];
    this.bob = this.signers[1];
    this.carol = this.signers[2];
    this.minter = this.signers[4];

    this.RDT = await ethers.getContractFactory("RevenueDistributionToken");
    this.TriToken = await ethers.getContractFactory("Tri");
    this.XTriToken = await ethers.getContractFactory("TriBar");
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
    this.ZeroAddress = "0x0000000000000000000000000000000000000000";
  });

  beforeEach(async function () {
    this.tri = await this.ERC20Mock.deploy("Trisolaris", "TRI", 18, "10000000000");
    this.revenueAsset = await this.ERC20Mock.deploy("Revenue Asset", "USN", 18, "10000000000");
    this.rdt = await this.RDT.deploy(
      "TRI Profit", // @TODO Finalize Token Name
      "pTRI",
      this.minter.address,
      this.revenueAsset.address,
      "100",
      this.tri.address,
    );

    await Promise.all([this.tri.deployed, this.revenueAsset.deployed, this.rdt.deployed]);
  });

  it("Users with no shares aren't entitled to revenue", async function () {
    expect(await this.rdt.claimableRevenueAssets(this.alice.address)).to.equal("0");
  });

  it("Users aren't entitled to revenue when rdt contains 0 revenue assets", async function () {
    await deposit(this.tri, this.alice, this.rdt);

    expect(await this.rdt.balanceOf(this.alice.address)).to.equal("1000");
    expect(await this.rdt.claimableRevenueAssets(this.alice.address)).to.equal("0");
  });

  it("Contract can be funded with revenue asset", async function () {
    await this.revenueAsset.transfer(this.rdt.address, "1000");

    expect(await this.revenueAsset.balanceOf(this.rdt.address)).to.equal("1000");
  });

  it("1 user receives prorated rewards", async function () {
    const depositAmount = "1000";
    const totalRevenueAmount = "1000"; // @TODO THIS IS WONKY
    this.tri.transfer(this.alice.address, depositAmount);

    // Fund RDT Contract
    const dayInSeconds = 100;
    const totalVestDays = 10;
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, depositAmount);
    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * dayInSeconds);
    const issuanceRate = await this.rdt.issuanceRate();
    await expect(issuanceRate).to.equal(100);

    let totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(0);

    let elapsedDays = 0;
    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * elapsedDays);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "0",
      "0/10 of revenue amount (1000) should be vested",
    );

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(0);

    elapsedDays++;
    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * 1);

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(100);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "100",
      "1/10 of revenue amount (1000) should be vested",
    );

    elapsedDays++;
    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * 1);

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(200);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "200",
      "2/10 of revenue amount (1000) should be vested",
    );

    elapsedDays += 28;

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * elapsedDays);

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(1000);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "1000",
      "10/10 of revenue amount (1000) should be vested",
    );
  });
});

async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
  await token.transfer(depositor.address, amount);

  await token.connect(depositor).approve(rdt.address, amount);

  await rdt.connect(depositor).deposit(amount, depositor.address);
}
