import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Tri__factory } from "../../typechain";
import { getBigNumber } from "../utils";

chai.use(solidity);
const { expect } = chai;

describe("RevenueDistributionToken - Migrate", function () {
  beforeEach(async function () {
    const [deployer, user0] = await ethers.getSigners();
    this.deployer = deployer;
    this.user0 = user0;
    const triFactory = new Tri__factory(this.deployer);
    this.tri = await triFactory.deploy(this.deployer.address);
    await this.tri.mint(this.deployer.address, "100");
    this.xTRI = await ethers.getContractFactory("TriBar");
    this.xTRI = await this.xTRI.deploy(this.tri.address);
    await this.tri.approve(this.xTRI.address, "100");
    await this.xTRI.enter("100");
    this.RDT = await ethers.getContractFactory("RevenueDistributionToken");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.usn = await ERC20Mock.deploy("usn", "usn", 18, getBigNumber("300") as any);
    const rdtConstructorArgs = ["RDT", "RDT", this.deployer.address, this.usn.address, this.tri.address];
    this.RDT = await this.RDT.deploy(...rdtConstructorArgs);
    await this.xTRI.approve(this.RDT.address, "100");
  });

  it("should migrate", async function () {
    await expect(await this.xTRI.balanceOf(this.deployer.address)).to.equal("100");
    await this.RDT.migrate(this.deployer.address, this.xTRI.address, "100");
    await expect(await this.tri.balanceOf(this.deployer.address)).to.equal("0");
    await expect(await this.xTRI.balanceOf(this.deployer.address)).to.equal("0");
    await expect(await this.tri.balanceOf(this.RDT.address)).to.equal("100");
    await expect(await this.RDT.balanceOf(this.deployer.address)).to.equal("100");
  });

  it("should fail migrate if user has no xTRI", async function () {
    await this.xTRI.leave("100");

    await this.tri.mint(this.user0.address, "100");
    await this.tri.connect(this.user0).approve(this.xTRI.address, "100");
    await this.xTRI.connect(this.user0).enter("100");

    await expect(await this.xTRI.balanceOf(this.deployer.address)).to.equal("0");
    await expect(await this.xTRI.balanceOf(this.user0.address)).to.equal("100");
    await expect(this.RDT.migrate(this.deployer.address, this.xTRI.address, "100")).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance",
    );

    await this.xTRI.connect(this.user0).approve(this.RDT.address, "100");
    await this.RDT.migrate(this.user0.address, this.xTRI.address, "100");
    await expect(await this.RDT.balanceOf(this.user0.address)).to.equal("100");
  });
});
