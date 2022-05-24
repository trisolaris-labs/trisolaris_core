import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Tri__factory } from "../../typechain";
import { getBigNumber } from "../utils";

chai.use(solidity);
const { expect } = chai;

describe("RevenueDistributionToken - Migrate", function () {
  beforeEach(async function () {
    const [deployer, user0,] = await ethers.getSigners();
    this.deployer = deployer;
    this.user0 = user0;
    const triFactory = new Tri__factory(this.deployer);
    this.tri = await triFactory.deploy(this.deployer.address);
    await this.tri.mint(this.deployer.address, "100");
    this.xTRI = await ethers.getContractFactory("TriBar");
    this.xTRI = await this.xTRI.deploy(this.tri.address);
    await this.tri.approve(this.xTRI.address, "100");
    await this.xTRI.enter("100");
    this.pTRI = await ethers.getContractFactory("StableTRIStaking");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.rewardToken = await ERC20Mock.deploy("rewardToken", "rewardToken", 18, getBigNumber("300") as any);
    const pTRIConstructorArgs = [
      "pTRI",
      "pTRI",
      this.rewardToken.address,
      this.tri.address,
      this.deployer.address,
      ethers.utils.parseEther("0.03"),
    ];
    this.pTRI = await this.pTRI.deploy(...pTRIConstructorArgs);
    await this.xTRI.approve(this.pTRI.address, "100");
  });

  it("should migrate", async function () {
    expect(await this.xTRI.balanceOf(this.deployer.address)).to.equal("100");
    await this.pTRI.migrate(this.deployer.address, this.xTRI.address, "100");
    expect(await this.tri.balanceOf(this.deployer.address)).to.equal("0");
    expect(await this.xTRI.balanceOf(this.deployer.address)).to.equal("0");
    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal("100");
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal("100");
  });

  it("should fail migrate if user has no xTRI", async function () {
    await this.xTRI.leave("100");

    await this.tri.mint(this.user0.address, "100");
    await this.tri.connect(this.user0).approve(this.xTRI.address, "100");
    await this.xTRI.connect(this.user0).enter("100");

    expect(await this.xTRI.balanceOf(this.deployer.address)).to.equal("0");
    expect(await this.xTRI.balanceOf(this.user0.address)).to.equal("100");
    await expect(this.pTRI.migrate(this.deployer.address, this.xTRI.address, "100")).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance",
    );

    await this.xTRI.connect(this.user0).approve(this.pTRI.address, "100");
    await this.pTRI.migrate(this.user0.address, this.xTRI.address, "100");
    expect(await this.pTRI.balanceOf(this.user0.address)).to.equal("100");
  });
});
