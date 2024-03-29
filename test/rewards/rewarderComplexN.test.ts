import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "../time";

describe("Complex N Rewarder", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];
    this.bob = this.signers[1];
    this.carol = this.signers[2];
    this.minter = this.signers[4];

    this.MasterChef = await ethers.getContractFactory("MasterChef");
    this.MasterChefV2 = await ethers.getContractFactory("MasterChefV2");
    this.TriToken = await ethers.getContractFactory("Tri");
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
    this.NRewarder = await ethers.getContractFactory("ComplexNRewarder");
    this.ZeroAddress = "0x0000000000000000000000000000000000000000";
  });

  beforeEach(async function () {
    this.tri = await this.TriToken.connect(this.minter).deploy(this.minter.address);
    await this.tri.deployed();

    this.chef = await this.MasterChef.connect(this.minter).deploy(this.tri.address, "1000", "0");
    await this.chef.deployed();

    await this.tri.connect(this.minter).setMinter(this.chef.address);

    this.lp = await this.ERC20Mock.connect(this.minter).deploy("LPToken", "LP", 18, "10000000000");
    await this.lp.deployed();
    this.dummy = await this.ERC20Mock.connect(this.minter).connect(this.minter).deploy("Dummy", "DummyT", 18, "100");
    await this.dummy.deployed();

    this.rewardToken1 = await this.ERC20Mock.connect(this.minter).deploy("RToken1", "RWT1", 18, "1000000000000");
    await this.rewardToken1.deployed();
    this.rewardToken2 = await this.ERC20Mock.connect(this.minter).deploy("RToken2", "RWT2", 18, "1000000000000");
    await this.rewardToken2.deployed();

    this.chefv2 = await this.MasterChefV2.connect(this.minter).deploy(this.chef.address, this.tri.address, 0);
    await this.chefv2.deployed();
  });

  it("should set correct state variables", async function () {
    this.rewarder = await this.NRewarder.deploy(
      [this.rewardToken1.address, this.rewardToken2.address],
      this.lp.address,
      ["0", "0"],
      this.chefv2.address,
    );
    await this.rewarder.deployed();
    expect(await this.rewarder.lpToken()).to.equal(this.lp.address);
    expect(await this.rewarder.rewardTokens(0)).to.equal(this.rewardToken1.address);
    expect(await this.rewarder.rewardTokens(1)).to.equal(this.rewardToken2.address);
    expect(await this.rewarder.MCV2()).to.equal(this.chefv2.address);
    expect(await this.rewarder.tokenPerBlock(0)).to.equal("0");
    expect(await this.rewarder.tokenPerBlock(1)).to.equal("0");
  });

  it("should allow owner and only owner to update reward rate", async function () {
    this.rewarder = await this.NRewarder.deploy(
      [this.rewardToken1.address, this.rewardToken2.address],
      this.lp.address,
      ["0", "0"],
      this.chefv2.address,
    );
    await this.rewarder.deployed();

    expect(await this.rewarder.tokenPerBlock(0)).to.equal("0");
    expect(await this.rewarder.tokenPerBlock(1)).to.equal("0");

    await expect(
      this.rewarder.connect(this.bob).setRewardRate(["1", "2"], { from: this.bob.address }),
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await this.rewarder.connect(this.alice).setRewardRate(["1", "2"], { from: this.alice.address });

    expect(await this.rewarder.tokenPerBlock(0)).to.equal("1");
    expect(await this.rewarder.tokenPerBlock(1)).to.equal("2");
  });

  it("should allow owner and only owner to withdraw remaining funds", async function () {
    this.rewarder = await this.NRewarder.deploy(
      [this.rewardToken1.address, this.rewardToken2.address],
      this.lp.address,
      ["0", "0"],
      this.chefv2.address,
    );

    // balance of lp 0 initially
    expect(await this.lp.balanceOf(this.rewarder.address)).to.equal("0");

    await this.lp.transfer(this.rewarder.address, "1000");
    expect(await this.lp.balanceOf(this.rewarder.address)).to.equal("1000");

    await expect(
      this.rewarder.connect(this.bob).reclaimTokens(this.lp.address, 1000, this.bob.address),
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // checking balance after claiming tokens
    await this.rewarder.connect(this.alice).reclaimTokens(this.lp.address, 1000, this.bob.address);
    expect(await this.lp.balanceOf(this.rewarder.address)).to.equal("0");
    expect(await this.lp.balanceOf(this.alice.address)).to.equal("0");
    expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
  });

  context("With rewarder contract added to a LP pool", function () {
    beforeEach(async function () {
      await this.lp.transfer(this.alice.address, "1000");
      await this.lp.transfer(this.bob.address, "1000");
      await this.lp.transfer(this.carol.address, "1000");

      // adding dummy token as lp
      await this.chef.connect(this.minter).add(100, this.dummy.address, this.ZeroAddress, true);
      // deploying chefv2
      this.chefv2 = await this.MasterChefV2.connect(this.minter).deploy(this.chef.address, this.tri.address, 0);
      await this.chefv2.deployed();
      // initialize the chefv2 contract by sending dummy tokens to chef
      await this.dummy.connect(this.minter).approve(this.chefv2.address, "10000000000000000000");
      await this.chefv2.connect(this.minter).init(this.dummy.address);
    });

    it("should not give reward tokens or TRI after emergency withdraw", async function () {
      this.rewarder = await this.NRewarder.deploy(
        [this.rewardToken1.address, this.rewardToken2.address],
        this.lp.address,
        ["0", "0"],
        this.chefv2.address,
      );
      await this.rewarder.deployed();
      await this.rewardToken1.transfer(this.rewarder.address, "1000000000000");
      await this.rewardToken2.transfer(this.rewarder.address, "1000000000000");

      await this.chefv2.add("100", this.lp.address, this.rewarder.address);
      await this.lp.connect(this.bob).approve(this.chefv2.address, "1000");

      expect(await this.chefv2.poolLength()).to.equal(1);
      await advanceBlockTo("19998");
      await this.rewarder.setRewardRate(["1", "1"]);
      expect(await this.lp.balanceOf(this.chefv2.address)).to.equal(0);
      await this.chefv2.connect(this.bob).deposit(0, "100", this.bob.address); // at block 200 bob deposits 100 lp tokens
      expect(await this.rewarder.userAmount(this.bob.address)).to.equal("100");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 0)).to.equal("0");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 1)).to.equal("0");

      let pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0);
      expect(pendingRewards.rewardAmounts[0]).to.equal(0);
      expect(pendingRewards.rewardAmounts[1]).to.equal(0);

      await advanceBlockTo("20005");
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0);
      expect(pendingRewards.rewardAmounts[0]).to.equal(5);
      expect(pendingRewards.rewardAmounts[1]).to.equal(5);

      await advanceBlockTo("20009");
      await this.chefv2.connect(this.bob).emergencyWithdraw(0, this.bob.address); // block 10010
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.rewardToken1.balanceOf(this.bob.address)).to.equal("10");
      expect(await this.rewardToken2.balanceOf(this.bob.address)).to.equal("10");

      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0);
      expect(pendingRewards.rewardAmounts[0]).to.equal(0);
      expect(pendingRewards.rewardAmounts[1]).to.equal(0);

      expect(await this.rewarder.userAmount(this.bob.address)).to.equal("0");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 0)).to.equal("0");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 1)).to.equal("0");
    });

    it("should give out TRIs and reward Tokens only after farming time", async function () {
      this.rewarder = await this.NRewarder.deploy(
        [this.rewardToken1.address, this.rewardToken2.address],
        this.lp.address,
        ["0", "0"],
        this.chefv2.address,
      );
      await this.rewarder.deployed();
      await this.rewardToken1.transfer(this.rewarder.address, "1000000000000");
      await this.rewardToken2.transfer(this.rewarder.address, "1000000000000");

      await this.chefv2.add("100", this.lp.address, this.rewarder.address);
      await this.lp.connect(this.bob).approve(this.chefv2.address, "1000");

      await advanceBlockTo("20099");
      await this.chefv2.connect(this.bob).deposit(0, "100", this.bob.address); // at block 100 bob deposits 100 lp tokens
      await this.rewarder.setRewardRate([0, 0]);
      // no rewards given when tokenPerBlock is 0
      await advanceBlockTo("20104");
      await this.chefv2.connect(this.bob).harvest(0, this.bob.address); // block 105
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("5000");
      expect(await this.rewardToken1.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.rewardToken2.balanceOf(this.bob.address)).to.equal("0");
      // accrued token per share is zero when reward is zero
      expect(await this.rewarder.accTokenPerShare(0)).to.equal(0);
      expect(await this.rewarder.accTokenPerShare(1)).to.equal(0);

      // reward tokens start accruing when we set a token Per block
      await advanceBlockTo("20109");
      await this.rewarder.setRewardRate([1, 2]);
      expect(await this.rewarder.userAmount(this.bob.address)).to.equal("100");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 0)).to.equal("0");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 1)).to.equal("0");

      await advanceBlockTo("20114");
      await this.chefv2.connect(this.bob).harvest(0, this.bob.address); // block 110
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("15000");
      expect(await this.rewardToken1.balanceOf(this.bob.address)).to.equal("5");
      expect(await this.rewardToken2.balanceOf(this.bob.address)).to.equal("10");

      expect(await this.rewarder.userAmount(this.bob.address)).to.equal("100");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 0)).to.equal("5");
      expect(await this.rewarder.userRewardDebt(this.bob.address, 1)).to.equal("10");

      await this.chefv2.connect(this.bob).withdraw(0, 100, this.bob.address);
    });

    it("should distribute TRIs and rewardToken properly for each staker", async function () {
      this.rewarder = await this.NRewarder.deploy(
        [this.rewardToken1.address, this.rewardToken2.address],
        this.lp.address,
        ["0", "0"],
        this.chefv2.address,
      );
      await this.rewarder.deployed();
      await this.rewarder.setRewardRate([100, 1000]);
      await this.rewardToken1.transfer(this.rewarder.address, "1000000000000");
      await this.rewardToken2.transfer(this.rewarder.address, "1000000000000");

      await this.chefv2.connect(this.minter).add("100", this.lp.address, this.rewarder.address);
      await this.lp.connect(this.alice).approve(this.chefv2.address, "1000", {
        from: this.alice.address,
      });
      await this.lp.connect(this.bob).approve(this.chefv2.address, "1000", {
        from: this.bob.address,
      });
      await this.lp.connect(this.carol).approve(this.chefv2.address, "1000", {
        from: this.carol.address,
      });

      // Alice deposits 10 LPs
      await advanceBlockTo("20509");
      await this.chefv2.connect(this.alice).deposit(0, "10", this.alice.address);
      // Bob deposits 20 LPs
      await advanceBlockTo("20513");
      await this.chefv2.connect(this.bob).deposit(0, "20", this.bob.address);
      // Carol deposits 30 LPs
      await advanceBlockTo("20517");
      await this.chefv2.connect(this.carol).deposit(0, "30", this.carol.address);
      // Alice harvests LPs
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334

      await advanceBlockTo("20519");
      await this.chefv2.connect(this.alice).harvest(0, this.alice.address);
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("566");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0");
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0");
      // Bob harvests 5 LPs
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/6*1000 = 6666
      await advanceBlockTo("20529");
      await this.chefv2.connect(this.bob).harvest(0, this.bob.address);
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("566");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("5666");
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6666");
      expect(await this.rewardToken1.balanceOf(this.bob.address)).to.equal("666");
      expect(await this.rewardToken2.balanceOf(this.bob.address)).to.equal("6666");
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0");
      // Alice withdraws 10 LPs
      // Bob withdraws 20 LP
      // Carol withdraws 30 LPs
      await advanceBlockTo("20539");
      await this.chefv2.connect(this.alice).withdraw(0, "10", this.alice.address);
      await advanceBlockTo("20549");
      await this.chefv2.connect(this.bob).withdraw(0, "20", this.bob.address);
      await advanceBlockTo("20559");
      await this.chefv2.connect(this.carol).withdraw(0, "30", this.carol.address);
      // Alice should have: 5666 tri
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666");
      // Bob should have: 6666 tri
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6666");
      // Carol should have: 0 tri
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0");

      // harvesting remaining tri
      await this.chefv2.connect(this.alice).harvest(0, this.alice.address);
      // Alice should have: 5666 + 20*1/6*1000 = 8999
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("8999");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("899");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("8999");

      const pendingAliceRewardAmount0 = await this.rewarder.pendingToken(this.alice.address, 0);
      expect(pendingAliceRewardAmount0[1]).to.equal("0");
      const pendingAliceRewardAmount1 = await this.rewarder.pendingToken(this.alice.address, 1);
      expect(pendingAliceRewardAmount1[1]).to.equal("0");
      const rewardAlice = await this.rewarder.pendingTokens("1", this.alice.address, "0");
      expect(rewardAlice.rewardAmounts[0]).to.equal("0");
      expect(rewardAlice.rewardAmounts[1]).to.equal("0");

      // Bob should have: 6190 + 10*2/6 * 1000 + 10*2/5*1000 = 11831
      await this.chefv2.connect(this.bob).harvest(0, this.bob.address);
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("13999");
      expect(await this.rewardToken1.balanceOf(this.bob.address)).to.equal("1399");
      expect(await this.rewardToken2.balanceOf(this.bob.address)).to.equal("13999");

      const pendingbobRewardAmount0 = await this.rewarder.pendingToken(this.bob.address, 0);
      expect(pendingbobRewardAmount0[1]).to.equal("0");
      const pendingbobRewardAmount1 = await this.rewarder.pendingToken(this.bob.address, 1);
      expect(pendingbobRewardAmount1[1]).to.equal("0");

      const rewardbob = await this.rewarder.pendingTokens("1", this.bob.address, "0");
      expect(rewardbob.rewardAmounts[0]).to.equal("0");
      expect(rewardbob.rewardAmounts[1]).to.equal("0");

      // Carol should have: 2*3/6*1000 + 20*3/6*1000 + 10*3/5*1000 + 10*1000 = 27000
      await this.chefv2.connect(this.carol).harvest(0, this.carol.address);
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("27000");
      expect(await this.rewardToken1.balanceOf(this.carol.address)).to.equal("2700");
      expect(await this.rewardToken2.balanceOf(this.carol.address)).to.equal("27000");

      const pendingcarolRewardAmount0 = await this.rewarder.pendingToken(this.carol.address, 0);
      expect(pendingcarolRewardAmount0[1]).to.equal("0");
      const pendingcarolRewardAmount1 = await this.rewarder.pendingToken(this.carol.address, 1);
      expect(pendingcarolRewardAmount1[1]).to.equal("0");

      const rewardcarol = await this.rewarder.pendingTokens("1", this.carol.address, "0");
      expect(rewardcarol.rewardAmounts[0]).to.equal("0");
      expect(rewardcarol.rewardAmounts[1]).to.equal("0");

      // All of them should have 1000 LP balance post withdrawal
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
    });

    it("should distribute no TRIs only rewardTokens since tri emission is 0 for this pool", async function () {
      this.lp2 = await this.ERC20Mock.connect(this.minter).deploy("LPToken", "LP", 18, "10000000000");
      await this.lp2.deployed();

      this.rewarder = await this.NRewarder.deploy(
        [this.rewardToken1.address, this.rewardToken2.address],
        this.lp2.address,
        ["0", "0"],
        this.chefv2.address,
      );
      await this.rewarder.deployed();
      await this.rewarder.setRewardRate([100, 500]);
      await this.rewardToken1.transfer(this.rewarder.address, "1000000000000");
      await this.rewardToken2.transfer(this.rewarder.address, "1000000000000");

      await this.chefv2.connect(this.minter).add("10", this.lp.address, this.ZeroAddress);
      await this.chefv2.connect(this.minter).add("0", this.lp2.address, this.rewarder.address);
      await this.lp2.connect(this.minter).transfer(this.alice.address, "1000");
      await this.lp2.connect(this.alice).approve(this.chefv2.address, "1000", {
        from: this.alice.address,
      });

      // Alice deposits 10 LPs
      await advanceBlockTo("20599");
      await this.chefv2.connect(this.alice).deposit(1, "10", this.alice.address);
      // Alice gets 500 reward tokens in 5 blocks
      await advanceBlockTo("20604");
      expect(await this.chefv2.pendingTri("1", this.alice.address)).to.equal("0");
      let pendingRewardAmount0 = await this.rewarder.pendingToken(this.alice.address, 0);
      expect(pendingRewardAmount0[1]).to.equal("400");
      let pendingRewardAmount1 = await this.rewarder.pendingToken(this.alice.address, 1);
      expect(pendingRewardAmount1[1]).to.equal("2000");
      let rewardAlice = await this.rewarder.pendingTokens("1", this.alice.address, "0");
      expect(rewardAlice.rewardAmounts[0]).to.equal("400");
      expect(rewardAlice.rewardAmounts[1]).to.equal("2000");

      // Alice harvests zero tri and 500 reward tokens
      await this.chefv2.connect(this.alice).harvest(1, this.alice.address);
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("0");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("500");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("2500");

      // Alice withdraws 10 deposited LP tokens so she claims pending reward tokens
      await this.chefv2.connect(this.alice).withdraw(1, "10", this.alice.address);
      await advanceBlockTo("20605");
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("0");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("600");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("3000");

      // Alice harvests zero reward tokens
      await this.chefv2.connect(this.alice).harvest(1, this.alice.address);
      await advanceBlockTo("20606");
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("0");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("600");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("3000");

      // No more reward tokens to be claimed
      pendingRewardAmount0 = await this.rewarder.pendingToken(this.alice.address, 0);
      expect(pendingRewardAmount0[1]).to.equal("0");
      pendingRewardAmount1 = await this.rewarder.pendingToken(this.alice.address, 1);
      expect(pendingRewardAmount1[1]).to.equal("0");
      rewardAlice = await this.rewarder.pendingTokens("1", this.alice.address, "0");
      expect(rewardAlice.rewardAmounts[0]).to.equal("0");
      expect(rewardAlice.rewardAmounts[1]).to.equal("0");
    });

    it("should return zero pending rewards for a user with no staked LP tokens", async function () {
      this.lp2 = await this.ERC20Mock.connect(this.minter).deploy("LPToken", "LP", 18, "10000000000");
      await this.lp2.deployed();

      this.rewarder = await this.NRewarder.deploy(
        [this.rewardToken1.address, this.rewardToken2.address],
        this.lp2.address,
        ["0", "0"],
        this.chefv2.address,
      );
      await this.rewarder.deployed();
      await this.rewarder.setRewardRate([100, 500]);
      await this.rewardToken1.transfer(this.rewarder.address, "1000000000000");
      await this.rewardToken2.transfer(this.rewarder.address, "1000000000000");

      await this.chefv2.connect(this.minter).add("10", this.lp.address, this.ZeroAddress);
      await this.chefv2.connect(this.minter).add("0", this.lp2.address, this.rewarder.address);

      await advanceBlockTo("20605");
      await advanceBlockTo("20610");
      expect(await this.chefv2.pendingTri("1", this.alice.address)).to.equal("0");
      const pendingRewardAmount0 = await this.rewarder.pendingToken(this.alice.address, 0);
      expect(pendingRewardAmount0[1]).to.equal("0");
      const pendingRewardAmount1 = await this.rewarder.pendingToken(this.alice.address, 1);
      expect(pendingRewardAmount1[1]).to.equal("0");
      const rewardAlice = await this.rewarder.pendingTokens("1", this.alice.address, "0");
      expect(rewardAlice.rewardAmounts[0]).to.equal("0");
      expect(rewardAlice.rewardAmounts[1]).to.equal("0");

      await this.chefv2.connect(this.alice).harvest(1, this.alice.address);
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("0");
      expect(await this.rewardToken1.balanceOf(this.alice.address)).to.equal("0");
      expect(await this.rewardToken2.balanceOf(this.alice.address)).to.equal("0");
    });
  });
});
