/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlock, advanceBlockTo } from "../time";

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

  it("Claimable rewards increases linearly", async function () {
    const depositAmount = "1000";
    const totalRevenueAmount = "10000";
    this.tri.transfer(this.alice.address, depositAmount);

    // Fund RDT Contract
    const dayInSeconds = 100;
    const totalVestDays = 10;
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, depositAmount);
    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * dayInSeconds);
    expect(await this.rdt.issuanceRate()).to.equal(1000);

    let totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(0);

    await advanceBlockTo(await ethers.provider.getBlockNumber());
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "0",
      "0/10 of revenue amount (10000) should be vested",
    );

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(0);

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds);

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(1000);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "1000",
      "1/10 of revenue amount (10000) should be vested",
    );

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds);

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(2000);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "2000",
      "2/10 of revenue amount (10000) should be vested",
    );

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * 28);

    totalClaimableRevenueAssets = await this.rdt.totalClaimableRevenueAssets();
    expect(totalClaimableRevenueAssets).to.equal(10000);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "10000",
      "10/10 of revenue amount (10000) should be vested",
    );
  });

  it("User 1 and User 2 earn same claimable amounts when staked at same time", async function () {
    const depositAmountAlice = "1000";
    const depositAmountBob = "1000";
    const totalRevenueAmount = "10000";
    this.tri.transfer(this.alice.address, depositAmountAlice);
    this.tri.transfer(this.bob.address, depositAmountBob);

    // Fund RDT Contract
    const dayInSeconds = 100;
    const totalVestDays = 10;
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, depositAmountAlice);
    await deposit(this.tri, this.bob, this.rdt, depositAmountBob);
    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * dayInSeconds);
    expect(await this.rdt.issuanceRate()).to.equal(1000);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    await advanceBlockTo(await ethers.provider.getBlockNumber());
    await Promise.all(
      [this.alice, this.bob].map(async user =>
        expect(await this.rdt.connect(user).claimableRevenueAssets(user.address)).to.equal(
          "0",
          "50% of 0/10 of revenue amount (10000) should be vested",
        ),
      ),
    );

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1000);
    await Promise.all(
      [this.alice, this.bob].map(async user =>
        expect(await this.rdt.connect(user).claimableRevenueAssets(user.address)).to.equal(
          "500",
          "50% of 1/10 of revenue amount (10000) should be vested",
        ),
      ),
    );

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2000);
    await Promise.all(
      [this.alice, this.bob].map(async user =>
        expect(await this.rdt.connect(user).claimableRevenueAssets(user.address)).to.equal(
          "1000",
          "50% of 2/10 of revenue amount (10000) should be vested",
        ),
      ),
    );

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * 28);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(10000);
    await Promise.all(
      [this.alice, this.bob].map(async user =>
        expect(await this.rdt.connect(user).claimableRevenueAssets(user.address)).to.equal(
          "5000",
          "50% of 10/10 of revenue amount (10000) should be vested",
        ),
      ),
    );
  });

  it("User 1 and User 2 stake at different times", async function () {
    const depositAmountAlice = "1000";
    const depositAmountBob = "1000";
    const totalRevenueAmount = "10000";
    this.tri.transfer(this.alice.address, depositAmountAlice);
    this.tri.transfer(this.bob.address, depositAmountBob);

    // Fund RDT Contract
    const dayInSeconds = 100;
    const totalVestDays = 10;
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, depositAmountAlice);
    const depositedBlockNumber = await ethers.provider.getBlockNumber();
    await advanceBlockTo(depositedBlockNumber + 1);

    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * dayInSeconds);
    expect(await this.rdt.issuanceRate()).to.equal(1000);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    await advanceBlockTo(await ethers.provider.getBlockNumber());
    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "0",
      "100% of 0/10 of revenue amount (10000) should be vested",
    );
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(
      "0",
      "0% of 0/10 of revenue amount (10000) should be vested",
    );

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(0);
    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds);
    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(1000);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "1000",
      "100% of 1/10 of revenue amount (10000) should be vested",
    );
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(
      "0",
      "0% of 1/10 of revenue amount (10000) should be vested",
    );

    await deposit(this.tri, this.bob, this.rdt, depositAmountBob);
    const depositBlockDelay = 97 / 100;
    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * depositBlockDelay);
    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(2000);

    expect(await this.rdt.connect(this.alice).claimableRevenueAssets(this.alice.address)).to.equal(
      "1000",
      "50% of 2/10 of revenue amount (10000) should be vested",
    );
    expect(await this.rdt.connect(this.bob).claimableRevenueAssets(this.bob.address)).to.equal(
      "1000",
      "50% of 2/10 of revenue amount (10000) should be vested",
    );

    await advanceBlockTo((await ethers.provider.getBlockNumber()) + dayInSeconds * 28);

    expect(await this.rdt.totalClaimableRevenueAssets()).to.equal(10000);
    await Promise.all(
      [this.alice, this.bob].map(async user =>
        expect(await this.rdt.connect(user).claimableRevenueAssets(user.address)).to.equal(
          "5000",
          "50% of 10/10 of revenue amount (10000) should be vested",
        ),
      ),
    );
  });

  it("Does not allow users to claim within 2 blocks of depositing", async function () {
    const depositAmountAlice = "1";
    const depositAmountBob = "1000";
    const totalRevenueAmount = "10000";
    this.tri.transfer(this.alice.address, depositAmountAlice);
    this.tri.transfer(this.bob.address, depositAmountBob);

    // Fund RDT Contract
    const dayInSeconds = 100;
    const totalVestDays = 100;
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    await deposit(this.tri, this.alice, this.rdt, depositAmountAlice);

    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestDays * dayInSeconds);

    await deposit(this.tri, this.bob, this.rdt, "1000");

    await expect(this.rdt.connect(this.bob).claim(this.bob.address)).to.be.revertedWith("RDT:C:DEPOSITED_TOO_RECENTLY");
    
    await advanceBlock();
    await advanceBlock();
    
    await expect(this.rdt.connect(this.bob).claim(this.bob.address)).not.to.be.reverted;
  });
});

async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
  await token.transfer(depositor.address, amount);

  await token.connect(depositor).approve(rdt.address, amount);

  await rdt.connect(depositor).deposit(amount, depositor.address);
}
