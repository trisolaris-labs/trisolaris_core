import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Tri__factory } from "../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("RevenueDistributionToken - Transfer", function () {
  beforeEach(async function () {
    await ethers.provider.send("hardhat_reset", []);
    //
    const [deployer, user0, user1] = await ethers.getSigners();
    this.deployer = deployer;
    this.user0 = user0;
    this.user1 = user1;
    this.ZeroAddress = "0x0000000000000000000000000000000000000000";

    const triFactory = new Tri__factory(this.deployer);
    this.tri = await triFactory.deploy(this.deployer.address);
    await this.tri.mint(this.deployer.address, "100");
    this.xTRI = await ethers.getContractFactory("TriBar");
    this.xTRI = await this.xTRI.deploy(this.tri.address);
    await this.tri.approve(this.xTRI.address, "100");
    await this.xTRI.enter("100");
    this.pTRI = await ethers.getContractFactory("StableTRIStaking");
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.rewardToken = await this.ERC20Mock.deploy("rewardToken", "rewardToken", 18, "100");
    const pTRIConstructorArgs = ["pTRI", "pTRI", this.rewardToken.address, this.tri.address, this.deployer.address, 0];
    this.pTRI = await this.pTRI.deploy(...pTRIConstructorArgs);
    await this.tri.approve(this.pTRI.address, "100000000000000000");
  });

  it("should pre-claim before transfer", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.rewardToken.transfer(this.pTRI.address, depositAmount);

    await this.pTRI.connect(this.deployer).transfer(this.user1.address, depositAmount);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(depositAmount);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(depositAmount);
  });

  it("pre-claim should revert if transfer reverts", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.rewardToken.transfer(this.pTRI.address, depositAmount);

    await expect(this.pTRI.connect(this.deployer).transfer(this.ZeroAddress, depositAmount)).to.be.revertedWith(
      "ERC20: transfer to the zero address",
    );

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(0);
  });

  it("should pre-claim before transferFrom", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.rewardToken.transfer(this.pTRI.address, depositAmount);

    await this.pTRI.connect(this.deployer).approve(this.user1.address, depositAmount);
    let deployerpTRIAllowance = await this.pTRI
      .connect(this.deployer)
      .allowance(this.deployer.address, this.user1.address);
    expect(deployerpTRIAllowance).to.equal(depositAmount);

    await this.pTRI.connect(this.user1).transferFrom(this.deployer.address, this.user1.address, depositAmount);
    deployerpTRIAllowance = await this.pTRI.allowance(this.deployer.address, this.user1.address);
    expect(deployerpTRIAllowance).to.equal(0);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(depositAmount);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(depositAmount);
  });

  it("pre-claim should revert if transferFrom reverts", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.rewardToken.transfer(this.pTRI.address, depositAmount);

    await this.pTRI.connect(this.deployer).approve(this.user1.address, depositAmount / 2);
    let deployerpTRIAllowance = await this.pTRI
      .connect(this.deployer)
      .allowance(this.deployer.address, this.user1.address);
    expect(deployerpTRIAllowance).to.equal(depositAmount / 2);

    await expect(
      this.pTRI.connect(this.user1).transferFrom(this.deployer.address, this.user1.address, depositAmount),
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    deployerpTRIAllowance = await this.pTRI.allowance(this.deployer.address, this.user1.address);
    expect(deployerpTRIAllowance).to.equal(depositAmount / 2);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(0);
  });

  it("should pre-claim zero before transfer if no claim", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);
    await this.rewardToken.burn(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.pTRI.connect(this.deployer).transfer(this.user1.address, depositAmount);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(depositAmount);
  });

  it("should pre-claim zero before transferFrom if no claim", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);
    await this.rewardToken.burn(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.pTRI.connect(this.deployer).approve(this.user1.address, depositAmount);
    let deployerpTRIAllowance = await this.pTRI
      .connect(this.deployer)
      .allowance(this.deployer.address, this.user1.address);
    expect(deployerpTRIAllowance).to.equal(depositAmount);

    await this.pTRI.connect(this.user1).transferFrom(this.deployer.address, this.user1.address, depositAmount);
    deployerpTRIAllowance = await this.pTRI.allowance(this.deployer.address, this.user1.address);
    expect(deployerpTRIAllowance).to.equal(0);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(depositAmount);
  });

  it("should pre-claim zero before transfer if already claimed", async function () {
    const depositAmount = 100;
    await this.tri.mint(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    await this.rewardToken.transfer(this.pTRI.address, depositAmount);
    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);

    await this.pTRI.connect(this.deployer).transfer(this.user1.address, depositAmount);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(100);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(depositAmount);

    await this.pTRI.connect(this.user1).transfer(this.deployer.address, depositAmount);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(100);
    expect(await this.rewardToken.balanceOf(this.user1.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.pTRI.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(100);
    expect(await this.pTRI.balanceOf(this.user1.address)).to.equal(0);
  });

  it("should claim before deposit and withdraw from escrow, escrow claims on withdrawal then user withdraws from pTRI", async function () {
    const depositAmount = 100;
    this.escrow = await ethers.getContractFactory("EscrowMock");
    this.escrow = await this.escrow.deploy("escrow", "escrow", 18, "100");
    await this.tri.mint(this.deployer.address, depositAmount);

    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(depositAmount);
    // Deposit 100 for deployer
    await this.pTRI.connect(this.deployer).deposit(depositAmount);

    expect(await this.tri.balanceOf(this.pTRI.address)).to.equal(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(depositAmount);

    // Add 100 revenue tokens to distribute to depositors
    await this.rewardToken.transfer(this.pTRI.address, depositAmount);
    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);

    expect(await this.pTRI.pendingReward(this.deployer.address, this.rewardToken.address)).to.equal(100);

    await this.pTRI.connect(this.deployer).approve(this.escrow.address, depositAmount);
    let deployerpTRIAllowance = await this.pTRI
      .connect(this.deployer)
      .allowance(this.deployer.address, this.escrow.address);
    expect(deployerpTRIAllowance).to.equal(depositAmount);

    // Deposit pTRI to escrow, claims and allowance goes down
    await this.escrow.connect(this.deployer).deposit(this.deployer.address, this.pTRI.address, depositAmount);

    deployerpTRIAllowance = await this.pTRI
      .connect(this.deployer)
      .allowance(this.deployer.address, this.escrow.address);
    expect(deployerpTRIAllowance).to.equal(0);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(depositAmount);
    expect(await this.rewardToken.balanceOf(this.pTRI.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.balanceOf(this.escrow.address)).to.equal(depositAmount);

    let [deployerAmount, deployerRewardDebt] = await this.pTRI
      .connect(this.deployer)
      .getUserInfo(this.deployer.address, this.rewardToken.address);

    expect(deployerAmount).to.equal(0);
    expect(deployerRewardDebt).to.equal(0);

    let [escrowAmount, escrowRewardDebt] = await this.pTRI.getUserInfo(this.escrow.address, this.rewardToken.address);

    expect(escrowAmount).to.equal(100);
    expect(escrowRewardDebt).to.equal(100);

    // Deposit 100 more reward tokens to redistribute, escrow should claim these
    await this.rewardToken.transfer(this.pTRI.address, depositAmount);
    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.pTRI.pendingReward(this.deployer.address, this.rewardToken.address)).to.equal(0);
    expect(await this.pTRI.pendingReward(this.escrow.address, this.rewardToken.address)).to.equal(100);

    // deployer user withdraws pTRI from escrow, escrow claims 100 revenue tokens
    await this.escrow.connect(this.deployer).withdraw(this.deployer.address, this.pTRI.address, depositAmount);

    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(100);
    expect(await this.pTRI.balanceOf(this.escrow.address)).to.equal(0);

    [escrowAmount, escrowRewardDebt] = await this.pTRI.getUserInfo(this.escrow.address, this.rewardToken.address);

    expect(escrowAmount).to.equal(0);
    expect(escrowRewardDebt).to.equal(0);

    [deployerAmount, deployerRewardDebt] = await this.pTRI
      .connect(this.deployer)
      .getUserInfo(this.deployer.address, this.rewardToken.address);

    expect(deployerAmount).to.equal(100);
    expect(deployerRewardDebt).to.equal(200);

    expect(await this.rewardToken.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.rewardToken.balanceOf(this.escrow.address)).to.equal(100);

    // deployer user withdraws tri from pTRI, 1:1, receives 100
    await this.pTRI.connect(this.deployer).withdraw(depositAmount);
    expect(await this.pTRI.balanceOf(this.deployer.address)).to.equal(0);
    expect(await this.tri.balanceOf(this.deployer.address)).to.equal(100);
    expect(await this.rewardToken.balanceOf(this.escrow.address)).to.equal(100);

    expect(await this.pTRI.pendingReward(this.deployer.address, this.rewardToken.address)).to.equal(0);
    expect(await this.pTRI.pendingReward(this.escrow.address, this.rewardToken.address)).to.equal(0);
  });
});
