
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "../time"

describe("Complex Rewarder", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.minter = this.signers[4]

    this.MasterChef = await ethers.getContractFactory("MasterChef")
    this.TriToken = await ethers.getContractFactory("Tri")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
    this.Rewarder = await ethers.getContractFactory("ComplexRewarder")
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
    this.rewarder = await this.Rewarder.deploy(this.rewardToken.address, this.lp.address, "0", this.chef.address)
    await this.rewarder.deployed()

    expect(await this.rewarder.lpToken()).to.equal(this.lp.address)
    expect(await this.rewarder.rewardToken()).to.equal(this.rewardToken.address)
    expect(await this.rewarder.MC()).to.equal(this.chef.address)
    expect(await this.rewarder.tokenPerBlock()).to.equal("0")
  })

  it("should allow owner and only owner to update reward rate", async function () {
    this.rewarder = await this.Rewarder.deploy(this.rewardToken.address, this.lp.address, "0", this.chef.address)
    await this.rewarder.deployed()

    expect(await this.rewarder.tokenPerBlock()).to.equal("0")

    await expect(this.rewarder.connect(this.bob).setRewardRate(1, { from: this.bob.address })).to.be.revertedWith("Ownable: caller is not the owner")

    await this.rewarder.connect(this.alice).setRewardRate(1, { from: this.alice.address })

    expect(await this.rewarder.tokenPerBlock()).to.equal(1)
  })

  it("should allow owner and only owner to withdraw remaining funds", async function () {
    this.rewarder = await this.Rewarder.deploy(this.rewardToken.address, this.lp.address, "0", this.chef.address)
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

      this.rewarder = await this.Rewarder.deploy(this.rewardToken.address, this.lp.address, "0", this.chef.address)
      await this.rewarder.deployed()

      await this.rewardToken.transfer(this.rewarder.address, "100000")
    })

    it("should give out TRIs and reward Tokens only after farming time", async function () {
      await this.chef.add("100", this.lp.address, this.rewarder.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      
      await advanceBlockTo("99")
      await this.chef.connect(this.bob).deposit(0, "100") // at block 100 bob deposits 100 lp tokens 
      await this.rewarder.setRewardRate(0)
      
      // no rewards given when tokenPerBlock is 0
      await advanceBlockTo("104")
      await this.chef.connect(this.bob).harvest(0) // block 105
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("5000")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("0")
      // accrued token per share is zero when reward is zero
      let poolInfo = await this.rewarder.poolInfo()
      expect(poolInfo.accTokenPerShare).to.equal(0)

      // reward tokens start accruing when we set a token Per block
      await advanceBlockTo("109")
      await this.rewarder.setRewardRate(1)
      expect((await this.rewarder.userInfo(this.bob.address)).amount).to.equal("100")
      expect((await this.rewarder.userInfo(this.bob.address)).rewardDebt).to.equal("0")

      await advanceBlockTo("114")
      await this.chef.connect(this.bob).harvest(0) // block 110
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("15000")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("5")

      expect((await this.rewarder.userInfo(this.bob.address)).amount).to.equal("100")
      expect((await this.rewarder.userInfo(this.bob.address)).rewardDebt).to.equal("5")

      await this.chef.connect(this.bob).withdraw(0, 100)
    })

    it("should not give reward tokens or TRI after emergency withdraw", async function () {
      await this.chef.add("100", this.lp.address, this.rewarder.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      
      expect(await this.chef.poolLength()).to.equal(1)
      await advanceBlockTo("198")
      await this.rewarder.setRewardRate(1)
      expect(await this.lp.balanceOf(this.chef.address)).to.equal(0)
      await this.chef.connect(this.bob).deposit(0, "100") // at block 200 bob deposits 100 lp tokens 
      
      expect((await this.rewarder.userInfo(this.bob.address)).amount).to.equal("100")
      expect((await this.rewarder.userInfo(this.bob.address)).rewardDebt).to.equal("1")
      let pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0) 

      await advanceBlockTo("205")
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(5) 
      // no rewards given when tokenPerBlock is 0
      await advanceBlockTo("209")
      await this.chef.connect(this.bob).emergencyWithdraw(0) // block 210
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("0")
      
      pendingRewards = await this.rewarder.pendingTokens(0, this.bob.address, 0)
      expect(pendingRewards.rewardAmounts[0]).to.equal(0) 

      expect((await this.rewarder.userInfo(this.bob.address)).amount).to.equal("0")
      expect((await this.rewarder.userInfo(this.bob.address)).rewardDebt).to.equal("0")
    })

    it("should distribute TRIs and rewardToken properly for each staker", async function () {
      // 100 per block reward token rate starting at block 300
      await this.chef.add("100", this.lp.address, this.rewarder.address, true)
      await this.rewarder.setRewardRate(1000)
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
      await advanceBlockTo("309")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      

      await advanceBlockTo("313")
      let pendingRewards = await this.rewarder.pendingTokens(0, this.alice.address, 0)
      let pendingTri = await this.chef.pendingTri(0, this.alice.address)
      console.log("pending rewards at block 313", pendingRewards.rewardAmounts[0].toString())
      console.log("pending tri at block 313", pendingTri.toString())

      // Bob deposits 20 LPs at block 314
      await this.chef.connect(this.bob).deposit(0, "20", { from: this.bob.address })
      pendingRewards = await this.rewarder.pendingTokens(0, this.alice.address, 0)
      pendingTri = await this.chef.pendingTri(0, this.alice.address)
      // TODO: pending TRI here is different because the lpSupply is calculated after the 
      // TODO: lp is deposited and not before that
      console.log("pending rewards at block 314", pendingRewards.rewardAmounts[0].toString())
      console.log("pending tri at block 314", pendingTri.toString())
      
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("317")
      await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address })
      pendingRewards = await this.rewarder.pendingTokens(0, this.alice.address, 0)
      pendingTri = await this.chef.pendingTri(0, this.alice.address)
      console.log("pending rewards at block 318", pendingRewards.rewardAmounts[0].toString())
      console.log("pending tri at block 318", pendingTri.toString())
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334
      /*
      await advanceBlockTo("319")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      expect(await this.tri.totalSupply()).to.equal("10000")
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.chef.address)).to.equal("4334")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo("329")
      await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address })
      expect(await this.tri.totalSupply()).to.equal("20000")
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6190")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("6190")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.chef.address)).to.equal("8144")
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo("339")
      await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address })
      await advanceBlockTo("349")
      await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address })
      await advanceBlockTo("359")
      await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address })
      expect(await this.tri.totalSupply()).to.equal("50000")
      // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("11600")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("11600")
      // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("11831")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("11600")
      // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("26568")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("11600")
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000")
      */
    })
  })
  
})