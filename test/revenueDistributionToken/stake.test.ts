/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockBy, advanceBlockTo } from "../time";

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

    await this.rdt.connect(this.minter).setVestingUpdater(this.minter.address);

    this.tri.transfer(this.alice.address, "1000");
    this.tri.transfer(this.alice.address, "1000");
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

  it("Claimable rewards increases linearly", async function () {
    const totalRevenueAmount = "12000";

    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, "1000");
    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1200);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1220);

    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2400);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(2420);

    await advanceBlockBy(totalVestBlocks);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(12000);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(12000);
  });

  it("User 1 and User 2 earn same claimable amounts when staked at same time", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    await deposit(this.tri, this.alice, this.rdt, "1000");
    await deposit(this.tri, this.bob, this.rdt, "1000");

    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1210);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(620);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(605);

    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2410);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1220);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(1205);

    await advanceBlockBy(totalVestBlocks);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(11940);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(5985);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(5970);
  });

  it("User 1 and User 2 stake at different times", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1210);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1210);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockBy(480);

    // Bob deposits
    await deposit(this.tri, this.bob, this.rdt, "1000");

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);

    // Alice should get 50% * 50% * totalRevenueAmount (~3000)
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(3020);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1200);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(3620);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(600);

    await advanceBlockBy(480);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(5930);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(5985);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(2965);
  });

  it("User 1 stakes, and User 2 stakes, User 1 unstakes", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    // 10% of vest has elapsed
    await advanceBlockBy(120);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1200);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1200);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    // 50% of vest has elapsed
    await advanceBlockBy(480);

    // Bob deposits
    await deposit(this.tri, this.bob, this.rdt, "1000");

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(3015);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockBy(120);

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
    expect(aliceRevenueAssetBalanceAfter - aliceRevenueAssetBalanceBefore).to.equal(3620);
    expect(await this.rdt.balanceOf(this.alice.address)).to.equal(0);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(0);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(1210);

    await advanceBlockBy(240);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2400);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(0);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(3610);
  });

  it("User 1 stakes, and User 2 stakes and immediately unstakes before vest end", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    await advanceBlockBy(120);

    // 10% of vest completed
    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1200);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(1200);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    // 50% of vest completed
    await advanceBlockBy(totalVestBlocks / 2);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(7200);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(7200);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    // // Bob deposits and immediately withdraws
    let bobTRIBalanceBefore = await this.tri.balanceOf(this.bob.address);

    await deposit(this.tri, this.bob, this.rdt, "1000");
    await this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.bob.address);

    let bobTRIBalanceAfter = await this.tri.balanceOf(this.bob.address);

    expect(bobTRIBalanceAfter - bobTRIBalanceBefore).to.equal(1000);
    expect(await this.revenueAsset.balanceOf(this.bob.address)).to.equal(5);
    expect(await this.rdt.balanceOf(this.bob.address)).to.equal(0);

    // Bob deposits and immediately withdraws AGAIN
    [bobTRIBalanceBefore] = await Promise.all([this.tri.balanceOf(this.bob.address)]);

    await deposit(this.tri, this.bob, this.rdt, "1000");
    await this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.bob.address);

    [bobTRIBalanceAfter] = await Promise.all([this.tri.balanceOf(this.bob.address)]);

    expect(bobTRIBalanceAfter - bobTRIBalanceBefore).to.equal(1000);
    expect(await this.revenueAsset.balanceOf(this.bob.address)).to.equal(10);
    expect(await this.rdt.balanceOf(this.bob.address)).to.equal(0);

    // Bob deposits and immediately withdraws AGAIN
    [bobTRIBalanceBefore] = await Promise.all([this.tri.balanceOf(this.bob.address)]);

    await deposit(this.tri, this.bob, this.rdt, "1000");
    await this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.bob.address);

    [bobTRIBalanceAfter] = await Promise.all([this.tri.balanceOf(this.bob.address)]);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(7320);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);

    await advanceBlockBy(totalVestBlocks);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(4650);
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(11970);
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(0);
  });

  it("Vests linearly when multiple deposits occur (4 claims)", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    // Vest 1 is 50% complete, 6000 rev units released
    await advanceBlockBy(600);

    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(6010);

    // Add Funds and Extend Vesting
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Vest 1 is 75% complete, 9000 rev units released
    // Vest 2 is 25% complete, 3000 rev units released
    await advanceBlockBy(300);

    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(10548);
    
    // Vest 1 is 100% complete, 6000 rev units released
    // Vest 2 is 50% complete, 6000 rev units released
    await advanceBlockBy(300); // Initial vesting period is completed
    
    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(15056);
    
    await advanceBlockBy(600); // Initial vesting period is completed
    
    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(24000);
  });
  
  it("Vests linearly when multiple deposits occur (3 claims)", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    // Vest 1 is 50% complete, 6000 rev units released
    await advanceBlockBy(600);

    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(6010);

    // Add Funds and Extend Vesting
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Vest 1 is 100% complete, 6000 rev units released
    // Vest 2 is 50% complete, 6000 rev units released
    await advanceBlockBy(600); // Initial vesting period is completed
    
    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(15040);
    
    await advanceBlockBy(600); // Initial vesting period is completed
    
    await this.rdt.connect(this.alice).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(24000);
  });
});

async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
  await token.transfer(depositor.address, amount);

  await token.connect(depositor).approve(rdt.address, amount);

  await rdt.connect(depositor).deposit(amount, depositor.address);
}
