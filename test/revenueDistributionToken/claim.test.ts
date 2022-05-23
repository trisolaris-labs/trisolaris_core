/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockBy } from "../time";

describe("RevenueDistributionToken - Claim", function () {
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
    await ethers.provider.send("hardhat_reset", []);
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
  });

  it("Claiming for another user sends funds to correct user", async function () {
    const totalRevenueAmount = "12000";

    // Fund RDT Contract
    await this.revenueAsset.transfer(this.rdt.address, totalRevenueAmount);

    const totalVestBlocks = 1200;
    await this.rdt.connect(this.minter).updateVestingSchedule(totalVestBlocks);

    // Alice deposits
    await deposit(this.tri, this.alice, this.rdt, "1000");

    await advanceBlockBy(300);

    await this.rdt.connect(this.bob).claim(this.alice.address);
    expect(await this.revenueAsset.balanceOf(this.alice.address)).to.equal(3010);
    expect(await this.revenueAsset.balanceOf(this.bob.address)).to.equal(0);
  });
});

async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
  await token.transfer(depositor.address, amount);

  await token.connect(depositor).approve(rdt.address, amount);

  await rdt.connect(depositor).deposit(amount, depositor.address);
}
