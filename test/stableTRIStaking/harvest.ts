import { solidity } from "ethereum-waffle";
import { ethers, network } from "hardhat";

import chai from "chai";

chai.use(solidity);
const { expect } = chai;

describe("Stable TRI - harvest", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.owner = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
    this.triMaker = this.signers[4];
    this.penaltyCollector = this.signers[5];

    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner);
    this.StableTRIStakingFactory = await ethers.getContractFactory("StableTRIStaking", this.owner);
  });

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    this.tri = await this.ERC20Mock.connect(this.owner).deploy("TRI", "TRI", 18, ethers.utils.parseEther("1000000"));

    this.rewardToken = await this.ERC20Mock.connect(this.owner).deploy(
      "USD TLP",
      "USD TLP",
      18,
      ethers.utils.parseEther("100000000"),
    );

    this.pTRI = await this.StableTRIStakingFactory.deploy(
      "pTRI",
      "pTRI",
      this.rewardToken.address,
      this.tri.address,
      this.penaltyCollector.address,
      ethers.utils.parseEther("0.00"),
    );

    await Promise.all([this.tri.deployed, this.rewardToken.deployed, this.pTRI.deployed]);

    await this.tri.transfer(this.alice.address, ethers.utils.parseEther("1000"));
    await this.tri.transfer(this.bob.address, ethers.utils.parseEther("1000"));
    await this.tri.transfer(this.carol.address, ethers.utils.parseEther("1000"));

    await this.tri.connect(this.alice).approve(this.pTRI.address, ethers.utils.parseEther("100000"));
    await this.tri.connect(this.bob).approve(this.pTRI.address, ethers.utils.parseEther("100000"));
    await this.tri.connect(this.carol).approve(this.pTRI.address, ethers.utils.parseEther("100000"));
  });

  it("should allow harvests of multiple users evenly", async function () {
    await this.pTRI.connect(this.alice).deposit(ethers.utils.parseEther("200"));
    expect(await this.tri.balanceOf(this.pTRI.address)).to.be.equal(ethers.utils.parseEther("200"));
    expect((await this.pTRI.getUserInfo(this.alice.address, this.tri.address))[0]).to.be.equal(
      ethers.utils.parseEther("200"),
    );

    await this.pTRI.connect(this.bob).deposit(ethers.utils.parseEther("200"));
    expect(await this.tri.balanceOf(this.pTRI.address)).to.be.equal(ethers.utils.parseEther("400"));
    expect((await this.pTRI.getUserInfo(this.bob.address, this.tri.address))[0]).to.be.equal(
      ethers.utils.parseEther("200"),
    );

    await this.pTRI.connect(this.carol).deposit(ethers.utils.parseEther("200"));
    expect(await this.tri.balanceOf(this.pTRI.address)).to.be.equal(ethers.utils.parseEther("600"));
    expect((await this.pTRI.getUserInfo(this.carol.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("0"),
    );

    await this.rewardToken.transfer(this.pTRI.address, ethers.utils.parseEther("300"));

    await this.pTRI.connect(this.alice).harvest();
    expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.alice.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );

    await this.pTRI.connect(this.bob).harvest();
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.bob.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );

    await this.pTRI.connect(this.carol).harvest();
    expect(await this.rewardToken.balanceOf(this.carol.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.carol.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );
  });

  it("should allow harvests of multiple users evenly and calculate multiple claims properly", async function () {
    await this.pTRI.connect(this.alice).deposit(ethers.utils.parseEther("200"));
    expect(await this.tri.balanceOf(this.pTRI.address)).to.be.equal(ethers.utils.parseEther("200"));
    expect((await this.pTRI.getUserInfo(this.alice.address, this.tri.address))[0]).to.be.equal(
      ethers.utils.parseEther("200"),
    );

    await this.pTRI.connect(this.bob).deposit(ethers.utils.parseEther("200"));
    expect(await this.tri.balanceOf(this.pTRI.address)).to.be.equal(ethers.utils.parseEther("400"));
    expect((await this.pTRI.getUserInfo(this.bob.address, this.tri.address))[0]).to.be.equal(
      ethers.utils.parseEther("200"),
    );

    await this.pTRI.connect(this.carol).deposit(ethers.utils.parseEther("200"));
    expect(await this.tri.balanceOf(this.pTRI.address)).to.be.equal(ethers.utils.parseEther("600"));
    expect((await this.pTRI.getUserInfo(this.carol.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("0"),
    );

    await this.rewardToken.transfer(this.pTRI.address, ethers.utils.parseEther("300"));

    await this.pTRI.connect(this.alice).harvest();
    expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.alice.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );
    // Alice claims again
    await this.pTRI.connect(this.alice).harvest();
    expect(await this.rewardToken.balanceOf(this.alice.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.alice.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );

    await this.pTRI.connect(this.bob).harvest();
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.bob.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );

    await this.pTRI.connect(this.carol).harvest();
    expect(await this.rewardToken.balanceOf(this.carol.address)).to.be.equal(ethers.utils.parseEther("100"));
    expect((await this.pTRI.getUserInfo(this.carol.address, this.tri.address))[1]).to.be.equal(
      ethers.utils.parseEther("000"),
    );
  });
});
