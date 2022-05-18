import { ethers } from "hardhat";
import { expect } from "chai";

describe("RevenueDistributionToken - Ownership", function () {
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

  it("Owner can set pending owner", async function () {
    expect(await this.rdt.pendingOwner()).to.equal(this.ZeroAddress);

    await this.rdt.connect(this.minter).setPendingOwner(this.alice.address);

    expect(await this.rdt.pendingOwner()).to.equal(this.alice.address);
  });

  it("Non owner can not set pending owner", async function () {
    await expect(this.rdt.connect(this.alice).setPendingOwner(this.bob.address)).to.be.revertedWith(
      "RDT:SPO:NOT_OWNER",
    );
  });

  it("Pending owner can accept ownership", async function () {
    await this.rdt.connect(this.minter).setPendingOwner(this.alice.address);

    expect(await this.rdt.pendingOwner()).to.equal(this.alice.address);

    await expect(this.rdt.connect(this.carol).acceptOwnership()).to.be.revertedWith("RDT:AO:NOT_PO");
    await this.rdt.connect(this.alice).acceptOwnership();

    expect(await this.rdt.pendingOwner()).to.equal(this.ZeroAddress);
    expect(await this.rdt.owner()).to.equal(this.alice.address);
  });
});
