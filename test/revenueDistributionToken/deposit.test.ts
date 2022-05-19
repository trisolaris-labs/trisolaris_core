import { ethers } from "hardhat";
import { expect } from "chai";

describe("RevenueDistributionToken - Deposit", function () {
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
      18,
      this.tri.address,
    );

    await Promise.all([this.tri.deployed, this.revenueAsset.deployed, this.rdt.deployed]);
  });

  it("Cannot deposit if insufficient balance", async function () {
    await expect(this.rdt.connect(this.alice).deposit("1000", this.alice.address)).to.be.revertedWith(
      "RDT:M:TRANSFER_FROM",
    );
  });

  it("Cannot deposit to zero receiver", async function () {
    await this.tri.transfer(this.alice.address, "1000");

    await expect(this.rdt.connect(this.alice).deposit("1000", this.ZeroAddress)).to.be.revertedWith(
      "RDT:D:ZERO_RECEIVER",
    );
  });

  it("Cannot deposit zero assets", async function () {
    await expect(this.rdt.connect(this.alice).deposit("0", this.alice.address)).to.be.revertedWith("RDT:M:ZERO_SHARES");
  });

  it("Cannot deposit if not approved", async function () {
    await this.tri.transfer(this.alice.address, "1000");

    await expect(this.rdt.connect(this.alice).deposit("1000", this.alice.address)).to.be.revertedWith(
      "RDT:M:TRANSFER_FROM",
    );
  });

  it("Depositor receives same # of shares", async function () {
    await this.tri.transfer(this.alice.address, "1000");

    await this.tri.connect(this.alice).approve(this.rdt.address, "1000");

    await this.rdt.connect(this.alice).deposit("1000", this.alice.address);

    expect(await this.rdt.balanceOf(this.alice.address)).to.equal("1000");
  });
});
