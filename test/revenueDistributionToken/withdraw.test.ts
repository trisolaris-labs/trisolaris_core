import { ethers } from "hardhat";
import { expect } from "chai";

describe("RevenueDistributionToken - Withdraw", function () {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function deposit(token: any, depositor: any, rdt: any, amount: string = "1000") {
    await token.transfer(depositor.address, amount);

    await token.connect(depositor).approve(rdt.address, amount);

    await rdt.connect(depositor).deposit(amount, depositor.address);
  }

  it("Cannot withdraw if insufficient balance", async function () {
    await deposit(this.tri, this.alice, this.rdt)
    
    await expect(
      this.rdt.connect(this.alice).withdraw("1001", this.alice.address, this.alice.address),
    ).to.be.revertedWith("RDT:B:INSUFFICIENT_BALANCE");
  });

  it("Rando cannot withdraw another user's balance", async function () {
    await deposit(this.tri, this.alice, this.rdt);

    await Promise.all([
      expect(this.rdt.connect(this.bob).withdraw("1000", this.bob.address, this.alice.address)).to.be.reverted,
      expect(this.rdt.connect(this.bob).withdraw("1000", this.alice.address, this.alice.address)).to.be.reverted,
    ])
  });

  it("User receives amount they deposited", async function () {
    await deposit(this.tri, this.alice, this.rdt, "2000");

    await expect(
      this.rdt.connect(this.alice).withdraw("1000", this.alice.address, this.alice.address),
    ).to.not.be.reverted;

    expect(await this.tri.balanceOf(this.alice.address)).to.equal("1000");
    expect(await this.rdt.balanceOf(this.alice.address)).to.equal("1000");

    await expect(this.rdt.connect(this.alice).withdraw("1000", this.alice.address, this.alice.address)).to.not.be
      .reverted;

    expect(await this.tri.balanceOf(this.alice.address)).to.equal("2000");
    expect(await this.rdt.balanceOf(this.alice.address)).to.equal("0");
  });
});
