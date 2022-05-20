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
      this.tri.address,
    );

    await Promise.all([this.tri.deployed, this.revenueAsset.deployed, this.rdt.deployed]);
  });

  it("Claiming for another user sends funds to correct user", async function () {
    expect(false).to.equal(true);
  });
});

async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
  await token.transfer(depositor.address, amount);

  await token.connect(depositor).approve(rdt.address, amount);

  await rdt.connect(depositor).deposit(amount, depositor.address);
}
