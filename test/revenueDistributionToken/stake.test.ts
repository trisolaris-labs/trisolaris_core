/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlock, advanceBlockTo } from "../time";

const DAYS_CONSTANT: number = 100;

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
      this.tri.address,
    );

    await Promise.all([this.tri.deployed, this.revenueAsset.deployed, this.rdt.deployed]);

    this.tri.transfer(this.alice.address, "1000");
    this.tri.transfer(this.alice.address, "1000");
  });

  xit("Users with no shares aren't entitled to revenue", async function () {
    expect(await this.rdt.claimableRevenueAssets(this.alice.address)).to.equal("0");
  });

  xit("Users aren't entitled to revenue when rdt contains 0 revenue assets", async function () {
    await deposit(this.tri, this.alice, this.rdt);

    expect(await this.rdt.balanceOf(this.alice.address)).to.equal("1000");
    expect(await this.rdt.claimableRevenueAssets(this.alice.address)).to.equal("0");
  });

  xit("Contract can be funded with revenue asset", async function () {
    await this.revenueAsset.transfer(this.rdt.address, "1000");

    expect(await this.revenueAsset.balanceOf(this.rdt.address)).to.equal("1000");
  });

  xit("Claimable rewards increases linearly", async function () {
    const totalRevenueAmount = "10000";

    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, "1000");
    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    const totalVestDays = 10;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * 60 * 60 * 24);

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1000);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1020);

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2000);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(2020);

    await advanceBlockByDays(8);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(10000);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(10020);
  });

  xit("User 1 and User 2 earn same claimable amounts when staked at same time", async function () {
    const totalRevenueAmount = "10000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestDays = 10;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * 60 * 60 * 24);
    // expect(await this.rdt.issuanceRate()).to.equal("10000000000");

    await deposit(this.tri, this.alice, this.rdt, "1000");
    await deposit(this.tri, this.bob, this.rdt, "1000");

    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1040);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(521);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(506);

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2040);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1021);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(1006);

    await advanceBlockByDays(8);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(9970);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(4986);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(4971);

    await advanceBlockTo(totalVestDays * DAYS_CONSTANT); // @TODO Should this be 10000?

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(9970);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(4986);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(4971);
  });

  xit("User 1 and User 2 stake at different times", async function () {
    const totalRevenueAmount = "10000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestDays = 10;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * 60 * 60 * 24);
    // expect(await this.rdt.issuanceRate()).to.equal("10000000000");

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1010);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1010);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockByDays(5);

    // Bob deposits
    await deposit(this.tri, this.bob, this.rdt, "1000");

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(6040);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(3024);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(4);

    await advanceBlockByDays(8);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(9970);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(4989);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(1969);

    await advanceBlockTo(totalVestDays * DAYS_CONSTANT); // @TODO Should this be 10000?

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(9970);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(4989);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(1969);
  });

  xit("User 1 stakes, and User 2 stakes, User 1 unstakes", async function () {
    const totalRevenueAmount = "10000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestDays = 10;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * 60 * 60 * 24);
    // expect(await this.rdt.issuanceRate()).to.equal("10000000000");

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1010);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1010);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockByDays(3);

    // Bob deposits
    await deposit(this.tri, this.bob, this.rdt, "1000");

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(4040);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(2023);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(3);

    await advanceBlockByDays(3);

    // Alice withdraws
    const [aliceTRIBalanceBefore, aliceRevenueAssetBalanceBefore] = await Promise.all([
      this.tri.balanceOf(this.alice.address),
      this.revenueAsset.balanceOf(this.alice.address),
    ]);

    await this.rdt.connect(this.alice).withdraw("1000", this.alice.address, this.alice.address);

    const [aliceTRIBalanceAfter, aliceRevenueAssetBalanceAfter] = await Promise.all([
      this.tri.balanceOf(this.alice.address),
      this.revenueAsset.balanceOf(this.alice.address),
    ]);

    expect(aliceTRIBalanceAfter - aliceTRIBalanceBefore).to.equal(1000);
    expect(aliceRevenueAssetBalanceAfter - aliceRevenueAssetBalanceBefore).to.equal(3528);
    expect(await this.rdt.balanceOf(this.alice.address)).to.equal(0);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(7050);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(0);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(3018);

    await advanceBlockTo(totalVestDays * DAYS_CONSTANT); // @TODO Should this be 10000?

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(7050);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(0);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(3018);
  });
  
  it.only("User 1 stakes, and User 2 stakes and immediately unstakes before vest end", async function () {
    const totalRevenueAmount = "10000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestDays = 10;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * 60 * 60 * 24);
    // expect(await this.rdt.issuanceRate()).to.equal("10000000000");

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    await advanceBlockByDays(1);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1001);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1001);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockByDays(5);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(6006);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(6006);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    // Bob deposits and immediately withdraws
    let [bobTRIBalanceBefore] = await Promise.all([
      this.tri.balanceOf(this.bob.address),
      this.revenueAsset.balanceOf(this.bob.address),
    ]);

    console.log('BOB DEPOSIT');
    await deposit(this.tri, this.bob, this.rdt, "1000");
    console.log('BOB WITHDRAW');
    await this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.bob.address);

    let [bobTRIBalanceAfter] = await Promise.all([
      this.tri.balanceOf(this.bob.address),
    ]);

    expect(bobTRIBalanceAfter - bobTRIBalanceBefore).to.equal(1000);
    // expect(await this.revenueAsset.balanceOf(this.bob.address)).to.equal(2);
    expect(await this.rdt.balanceOf(this.bob.address)).to.equal(0);
    
    // Bob deposits and immediately withdraws AGAIN
    [bobTRIBalanceBefore] = await Promise.all([
      this.tri.balanceOf(this.bob.address),
    ]);
    
    console.log('BOB DEPOSIT');
    await deposit(this.tri, this.bob, this.rdt, "1000");
    console.log('BOB WITHDRAW');
    await this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.bob.address);

    [bobTRIBalanceAfter] = await Promise.all([
      this.tri.balanceOf(this.bob.address),
    ]);

    expect(bobTRIBalanceAfter - bobTRIBalanceBefore).to.equal(1000);
    // expect(await this.revenueAsset.balanceOf(this.bob.address)).to.equal(4);
    expect(await this.rdt.balanceOf(this.bob.address)).to.equal(0);
    
    // Bob deposits and immediately withdraws AGAIN
    [bobTRIBalanceBefore] = await Promise.all([
      this.tri.balanceOf(this.bob.address),
    ]);
    
    console.log('BOB DEPOSIT');
    await deposit(this.tri, this.bob, this.rdt, "1000");
    console.log('BOB WITHDRAW');
    await this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.bob.address);

    [bobTRIBalanceAfter] = await Promise.all([
      this.tri.balanceOf(this.bob.address),
    ]);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(5995);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(6013);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);
    
    await advanceBlockByDays(5);

    
    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(9987);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(9989);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

  // await expect(this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * 60 * 60 * 24)).to.not.be.reverted;

    // await this.rdt.connect(this.alice).claim(this.alice.address);
    // console.log(
    //   "end: alice revenue asset: ",
    //   (await this.revenueAsset.balanceOf(this.alice.address)).toString(),
    // );
    // console.log(
    //   "end: bob revenue asset: ",
    //   (await this.revenueAsset.balanceOf(this.bob.address)).toString(),
    // );
  });
});

async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
  await token.transfer(depositor.address, amount);

  await token.connect(depositor).approve(rdt.address, amount);

  await rdt.connect(depositor).deposit(amount, depositor.address);
}

async function advanceBlockByDays(daysToAdvance: number = 0) {
  console.log('TIME += ', daysToAdvance, ' days');
  await ethers.provider.send("evm_increaseTime", [daysToAdvance * 60 * 60 * 24]);
  await advanceBlockTo((await ethers.provider.getBlockNumber()) + daysToAdvance * DAYS_CONSTANT);
}