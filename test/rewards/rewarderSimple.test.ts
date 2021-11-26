
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "../time"

describe("Simple Rewarder", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.minter = this.signers[4]

    this.MasterChef = await ethers.getContractFactory("MasterChef")
    this.TriToken = await ethers.getContractFactory("Tri")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
    this.SimpleRewarder = await ethers.getContractFactory("SimpleRewarder")
    this.ZeroAddress = "0x0000000000000000000000000000000000000000"
  })

  beforeEach(async function () {
    this.tri = await this.TriToken.deploy(this.minter.address)
    await this.tri.deployed()

    this.chef = await this.MasterChef.deploy(this.tri.address, "1000", "0")
    await this.chef.deployed()

    await this.tri.connect(this.minter).setMinter(this.chef.address)

    this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")
    await this.lp.deployed()

    this.rewardToken = await this.ERC20Mock.deploy("RToken", "RWT", "10000000000")
    await this.rewardToken.deployed()
  })

  it("should set correct state variables", async function () {
    const rewardMultiplier = "1000000000000"
    this.rewarder = await this.SimpleRewarder.deploy(rewardMultiplier, this.rewardToken.address, this.chef.address)
    await this.rewarder.deployed()

    expect(await this.rewarder.rewardToken()).to.equal(this.rewardToken.address)
    expect(await this.rewarder.MASTERCHEF()).to.equal(this.chef.address)
    expect(await this.rewarder.rewardMultiplier()).to.equal(rewardMultiplier)
  })

  it("should allow owner and only owner to update reward multiplier", async function () {
    const rewardMultiplier = "1000000000000"
    this.rewarder = await this.SimpleRewarder.deploy(rewardMultiplier, this.rewardToken.address, this.chef.address)
    await this.rewarder.deployed()

    expect(await this.rewarder.rewardMultiplier()).to.equal(rewardMultiplier)

    await expect(this.rewarder.connect(this.bob).setRewardMultiplier(1, { from: this.bob.address })).to.be.revertedWith("Ownable: caller is not the owner")

    await this.rewarder.connect(this.alice).setRewardMultiplier(0, { from: this.alice.address })

    expect(await this.rewarder.rewardMultiplier()).to.equal(0)
  })

  it("should allow owner and only owner to withdraw remaining funds", async function () {
    const rewardMultiplier = "1000000000000"
    this.rewarder = await this.SimpleRewarder.deploy(rewardMultiplier, this.rewardToken.address, this.chef.address)
    await this.rewarder.deployed()

    // balance of lp 0 initially
    expect(await this.lp.balanceOf(this.rewarder.address)).to.equal("0")

    await this.lp.transfer(this.rewarder.address, "1000")
    expect(await this.lp.balanceOf(this.rewarder.address)).to.equal("1000")
    
    await expect(this.rewarder.connect(this.bob).reclaimTokens(this.lp.address, 1000, this.bob.address)).to.be.revertedWith("Ownable: caller is not the owner")

    // checking balance after claiming tokens
    await this.rewarder.connect(this.alice).reclaimTokens(this.lp.address, 1000, this.bob.address)
    expect(await this.lp.balanceOf(this.rewarder.address)).to.equal("0")
    expect(await this.lp.balanceOf(this.alice.address)).to.equal("0")
    expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
  })

  context("With rewarder contract added to a LP pool", function () {
    beforeEach(async function () {
      await this.lp.transfer(this.alice.address, "1000")
      await this.lp.transfer(this.bob.address, "1000")
      await this.lp.transfer(this.carol.address, "1000")

      this.precision = ethers.BigNumber.from("1000000000000")
      this.rewardMultiplier = this.precision.div(10) // 10% of tri rewards
      this.rewarder = await this.SimpleRewarder.deploy(this.rewardMultiplier, this.rewardToken.address, this.chef.address)
      await this.rewarder.deployed()
      
      await this.rewardToken.transfer(this.rewarder.address, "100000")
    })

    it("should give out TRIs and reward Tokens after multiplier update", async function () {
      await this.chef.add("100", this.lp.address, this.rewarder.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      
      await this.rewarder.setRewardMultiplier(0)

      await advanceBlockTo("20099")
      await this.chef.connect(this.bob).deposit(0, "100") // at block 100 bob deposits 100 lp tokens 
      
      // no rewards given when rewardMultiplier is 0
      await advanceBlockTo("20104")
      let pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0) 
      await this.chef.connect(this.bob).harvest(0) // block 105
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0) 
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("5000")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(0)


      await this.rewarder.setRewardMultiplier(this.rewardMultiplier)

      await advanceBlockTo("20109")
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(400) 

      await this.chef.connect(this.bob).harvest(0) // block 110
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0) 
      // TRI balance is 5000 + 5000
      // Reward token balance is 0 + 5000
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("10000")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(500)
      
    })
    
    it("should not give reward tokens or TRI after emergency withdraw", async function () {
      await this.chef.add("100", this.lp.address, this.rewarder.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      
      await advanceBlockTo("20199")
      expect(await this.lp.balanceOf(this.chef.address)).to.equal(0)
      await this.chef.connect(this.bob).deposit(0, "100") // at block 200 bob deposits 100 lp tokens 
      
      let pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0) 

      await advanceBlockTo("20205")
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(500) 
      
      await advanceBlockTo("20209")
      await this.chef.connect(this.bob).emergencyWithdraw(0) // block 210
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("0")
      
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0)
    })
    
    it("should distribute TRIs and rewardToken properly for each staker", async function () {
      // 100 per block reward token rate starting at block 300
      await this.chef.add("100", this.lp.address, this.rewarder.address, true)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
        from: this.alice.address,
      })
      await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
        from: this.bob.address,
      })
      await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
        from: this.carol.address,
      })

      // Alice deposits 10 LPs at block 310
      await advanceBlockTo("20309")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      
      await advanceBlockTo("20313")
      // Bob deposits 20 LPs at block 314
      await this.chef.connect(this.bob).deposit(0, "20", { from: this.bob.address })
      
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("20317")
      await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address })
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334
      
      await advanceBlockTo("20319")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      expect(await this.tri.totalSupply()).to.equal("10000")
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("566")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.chef.address)).to.equal("4334")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo("20329")
      await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address })
      expect(await this.tri.totalSupply()).to.equal("20000")
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("566")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6190")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("619")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.chef.address)).to.equal("8144")
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo("20339")
      await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address })
      await advanceBlockTo("20349")
      await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address })
      await advanceBlockTo("20359")
      await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address })
      expect(await this.tri.totalSupply()).to.equal("50000")
      // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("11600")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("1159")
      // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("11831")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("1183")
      // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("26568")
      expect(await this.rewardToken.balanceOf(this.carol.address)).to.equal("2656")
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000")
    })
  
  })
})