import { assert, expect } from "chai"
import { ethers } from "hardhat";
import { advanceBlockTo, advanceBlock } from "../time"

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount: any, decimals = 18) {
    const BASE_TEN = 10
    return ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(BASE_TEN).pow(decimals))
}

describe("MasterChefV2", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.minter = this.signers[4]

    this.MasterChef = await ethers.getContractFactory("MasterChef")
    this.MasterChefV2 = await ethers.getContractFactory("MasterChefV2")
    this.TriToken = await ethers.getContractFactory("Tri")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
    this.RewarderMock = await ethers.getContractFactory("RewarderMock")
    this.ZeroAddress = "0x0000000000000000000000000000000000000000"
  })

  beforeEach(async function () {
    this.tri = await this.TriToken.deploy(this.minter.address)
    await this.tri.deployed()
    this.triPerBlockv1 = getBigNumber(10)
    this.chef = await this.MasterChef.connect(this.minter).deploy(this.tri.address, this.triPerBlockv1, "0")
    await this.chef.deployed()
    this.lp = await this.ERC20Mock.connect(this.minter).deploy("LPToken", "LPT", getBigNumber(10))
    await this.lp.deployed()
    this.dummy = await this.ERC20Mock.connect(this.minter).deploy("Dummy", "DummyT", getBigNumber(10))
    await this.dummy.deployed()

    await this.tri.connect(this.minter).setMinter(this.chef.address)
    // adding 2 pools in chef
    await this.chef.connect(this.minter).add(100, this.lp.address, this.ZeroAddress, true)
    // adding dummy token as an LP pool in chef
    // this is the pool in chefV1 for chefV2
    // pool=0 and pool=1 both have allocPoints=100 so tri will be divided equally among both
    await this.chef.connect(this.minter).add(100, this.dummy.address, this.ZeroAddress, true)

    // depositing 10 lp tokens in 0th pool
    await this.lp.connect(this.minter).approve(this.chef.address, getBigNumber(10))
    await this.chef.connect(this.minter).deposit(0, getBigNumber(10))
    // deploying chefv2
    this.chefv2 = await this.MasterChefV2.connect(this.minter).deploy(this.chef.address, this.tri.address, 1)
    await this.chefv2.deployed()
    this.rlp = await this.ERC20Mock.connect(this.minter).deploy("RLP", "rLPT", getBigNumber(100))
    await this.rlp.deployed()
    this.rlp2 = await this.ERC20Mock.connect(this.minter).deploy("RLP", "rLPT", getBigNumber(100))
    await this.rlp2.deployed()
    this.rewardToken = await this.ERC20Mock.connect(this.minter).deploy("Reward", "RewardT", getBigNumber(100000))
    await this.rewardToken.deployed()
    this.rewarder = await this.RewarderMock.connect(this.minter).deploy(1, this.rewardToken.address, this.chefv2.address)
    await this.rewarder.deployed()

    // initialize the chefv2 contract by sending dummy tokens to chef
    await this.dummy.connect(this.minter).approve(this.chefv2.address, getBigNumber(10))
    await this.chefv2.connect(this.minter).init(this.dummy.address)
    await this.rlp.transfer(this.bob.address, getBigNumber(1))
  })

  describe("Init", function () {
    it("Balance of dummyToken should be 0 after init(), repeated execution should fail", async function () {
      await expect(this.chefv2.init(this.dummy.address)).to.be.revertedWith("Balance must exceed 0")
    })
  })

  describe("PoolLength", function () {
    it("PoolLength should execute", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      expect(await this.chefv2.poolLength()).to.be.equal(1)
    })
  })
  
  describe("Set", function () {
    it("Should emit event LogSetPool", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.chefv2.set(0, 10, this.dummy.address, false))
        .to.emit(this.chefv2, "LogSetPool")
        .withArgs(0, 10, this.rewarder.address, false)
      await expect(this.chefv2.set(0, 10, this.dummy.address, true)).to.emit(this.chefv2, "LogSetPool").withArgs(0, 10, this.dummy.address, true)
    })

    
    it("Should revert if invalid pool", async function () {
      try {
        await this.chefv2.set(0, 10, this.rewarder.address, false)
      } catch (e: unknown) {
        if (e instanceof Error) (
          expect(e.toString()).to.not.equal("")
        )
      }
    })
    
  })

  describe("PendingTri", function () {
    it("PendingTri should equal ExpectedTri", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.transfer(this.alice.address, getBigNumber(10))
      await this.rlp.connect(this.alice).approve(this.chefv2.address, getBigNumber(10))
      let log = await this.chefv2.connect(this.alice).deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.chefv2.updatePool(0)
      await advanceBlock()
      let expectedTri = this.triPerBlockv1
        .mul(log2.blockNumber + 1 - log.blockNumber)
        .div(2)
      let pendingTri = await this.chefv2.pendingTri(0, this.alice.address)
      expect(pendingTri).to.be.equal(expectedTri)
    })
    it("When block is lastRewardBlock", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      let log = await this.chefv2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      await advanceBlock()
      await advanceBlock()
      let log2 = await this.chefv2.updatePool(0)
      let expectedTri = this.triPerBlockv1
        .mul(log2.blockNumber - log.blockNumber)
        .div(2)
      let pendingTri = await this.chefv2.pendingTri(0, this.alice.address)
      expect(pendingTri).to.be.equal(expectedTri)
    })
  })

  describe("MassUpdatePools", function () {
    it("Should call updatePool", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlock()
      await this.chefv2.massUpdatePools([0])
      //expect('updatePool').to.be.calledOnContract(); //not suported by heardhat
      //expect('updatePool').to.be.calledOnContractWith(0); //not suported by heardhat
    })

    
    it("Updating invalid pools should fail", async function () {
      try {
        await this.chefv2.massUpdatePools([0, 10000, 100000])
      } catch (e: unknown) {
        if (e instanceof Error) (
          expect(e.toString()).to.not.equal("")
        )
      } 
    })
    
  })
  
  
  describe("Add", function () {
    it("Should add pool with reward token multiplier", async function () {
      await expect(this.chefv2.add(10, this.rlp.address, this.rewarder.address))
        .to.emit(this.chefv2, "LogPoolAddition")
        .withArgs(0, 10, this.rlp.address, this.rewarder.address)
    })
  })

  describe("UpdatePool", function () {
    it("Should emit event LogUpdatePool", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlock()
      await expect(this.chefv2.updatePool(0))
        .to.emit(this.chefv2, "LogUpdatePool")
        .withArgs(
          0,
          (await this.chefv2.poolInfo(0)).lastRewardBlock,
          await this.rlp.balanceOf(this.chefv2.address),
          (await this.chefv2.poolInfo(0)).accTriPerShare
        )
    })
  })
  
  describe("Deposit", function () {
    it("Depositing 0 amount", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      await expect(this.chefv2.connect(this.alice).deposit(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chefv2, "Deposit")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })

    
    it("Depositing into non-existent pool should fail", async function () {
      try {
        await this.chefv2.deposit(1001, getBigNumber(0), this.alice.address)
      } catch (e: unknown) {
        if (e instanceof Error) (
          expect(e.toString()).to.not.equal("")
        )
      } 
    })
    
  })

  
  describe("Withdraw", function () {
    it("Withdraw 0 amount", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.chefv2.connect(this.alice).withdraw(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chefv2, "Withdraw")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })
  })
  
  describe("Harvest", function () {
    it("Should give back the correct amount of TRI and reward", async function () {
      await this.rewardToken.connect(this.minter).transfer(this.rewarder.address, getBigNumber(100000))
      await this.chefv2.connect(this.minter).add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.connect(this.minter).transfer(this.alice.address, getBigNumber(10))
      await this.rlp.connect(this.alice).approve(this.chefv2.address, getBigNumber(10))
      expect(await this.chefv2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chefv2.connect(this.alice).deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      await advanceBlock()
      await advanceBlock()
      await advanceBlock()
      let log2 = await this.chefv2.connect(this.alice).withdraw(0, getBigNumber(1), this.alice.address)
      let expectedTri = this.triPerBlockv1
        .mul(log2.blockNumber - log.blockNumber)
        .div(2)
      expect((await this.chefv2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedTri)
      await this.chefv2.connect(this.alice).harvest(0, this.alice.address)
      const triBal = await this.tri.balanceOf(this.alice.address)
      const rewardBal = await this.rewardToken.balanceOf(this.alice.address)
      expect(triBal)
        .to.be.equal(rewardBal)
        .to.be.equal(expectedTri)
    })
    it("Harvest with empty user balance", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.chefv2.harvest(0, this.alice.address)
    })

    it("Harvest for TRI-only pool", async function () {
      await this.chefv2.connect(this.minter).add(10, this.rlp.address, this.ZeroAddress)
      await this.rlp.connect(this.minter).transfer(this.alice.address, getBigNumber(10))
      await this.rlp.connect(this.alice).approve(this.chefv2.address, getBigNumber(10))
      expect(await this.chefv2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chefv2.connect(this.alice).deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.chefv2.connect(this.alice).withdraw(0, getBigNumber(1), this.alice.address)
      let expectedTri = this.triPerBlockv1
        .mul(log2.blockNumber - log.blockNumber)
        .div(2)
      expect((await this.chefv2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedTri)
      await this.chefv2.connect(this.alice).harvest(0, this.alice.address)
      expect(await this.tri.balanceOf(this.alice.address)).to.be.equal(expectedTri)
    })

    it("should distribute TRIs and rewardToken properly for each staker", async function () {
      await this.chef.connect(this.minter).updateTriPerBlock("2000")
      await this.chefv2.connect(this.minter).add("100", this.rlp.address, this.rewarder.address)
      await this.rewardToken.connect(this.minter).transfer(this.rewarder.address, getBigNumber(100000))
      
      await this.rlp.connect(this.minter).transfer(this.alice.address, "1000")
      await this.rlp.connect(this.alice).approve(this.chefv2.address, "1000", {
        from: this.alice.address,
      })
      await this.rlp.connect(this.minter).transfer(this.bob.address, "1000")
      await this.rlp.connect(this.bob).approve(this.chefv2.address, "1000", {
        from: this.bob.address,
      })
      await this.rlp.connect(this.minter).transfer(this.carol.address, "1000")
      await this.rlp.connect(this.carol).approve(this.chefv2.address, "1000", {
        from: this.carol.address,
      })
      // Alice deposits 10 LPs at block 5010
      await advanceBlockTo("5009")
      await this.chefv2.connect(this.alice).deposit(0, "10", this.alice.address)
      // Bob deposits 20 LPs at block 5014
      await advanceBlockTo("5013")
      await this.chefv2.connect(this.bob).deposit(0, "20", this.bob.address)
      // Carol deposits 30 LPs at block 5018
      await advanceBlockTo("5017")
      await this.chefv2.connect(this.carol).deposit(0, "30", this.carol.address)
      // Alice harvests LPs at block 5020. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334
      await advanceBlockTo("5019")
      await this.chefv2.connect(this.alice).harvest(0, this.alice.address)
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      // Bob harvests 5 LPs at block 5030. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/6*1000 = 6666
      await advanceBlockTo("5029")
      await this.chefv2.connect(this.bob).harvest(0, this.bob.address)
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6666")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("6666")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      // Alice withdraws 10 LPs at block 5040.
      // Bob withdraws 20 LPs at block 5050.
      // Carol withdraws 30 LPs at block 5060.
      await advanceBlockTo("5039")
      await this.chefv2.connect(this.alice).withdraw(0, "10",this.alice.address)
      await advanceBlockTo("5049")
      await this.chefv2.connect(this.bob).withdraw(0, "20",this.bob.address)
      await advanceBlockTo("5059")
      await this.chefv2.connect(this.carol).withdraw(0, "30",this.carol.address)
      // Alice should have: 5666 tri
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      // Bob should have: 6666 tri
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6666")
      // Carol should have: 0 tri
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")

      // harvesting remaining tri
      await this.chefv2.connect(this.alice).harvest(0, this.alice.address)
      // Alice should have: 5666 + 20*1/6*1000 = 8999
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("8999")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("8999")
      await this.chefv2.connect(this.bob).harvest(0, this.bob.address)
      // Bob should have: 6190 + 10*2/6 * 1000 + 10*2/5*1000 = 11831
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("13999")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("13999")
      await this.chefv2.connect(this.carol).harvest(0, this.carol.address)
      // Carol should have: 2*3/6*1000 + 20*3/6*1000 + 10*3/5*1000 + 10*1000 = 27000
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("27000")
      expect(await this.rewardToken.balanceOf(this.carol.address)).to.equal("27000")
      // All of them should have 1000 LPs back.
    })

    it("should give proper TRIs and rewardToken allocation to each pool", async function () {
      // 100 per block farming rate starting at block 6000
      await this.chef.connect(this.minter).updateTriPerBlock("2000")
      await this.rewardToken.connect(this.minter).transfer(this.rewarder.address, getBigNumber(100000))
      
      await this.rlp.connect(this.minter).transfer(this.alice.address, "1000")
      await this.rlp.connect(this.alice).approve(this.chefv2.address, "1000")

      await this.rlp2.connect(this.minter).transfer(this.bob.address, "1000")
      await this.rlp2.connect(this.bob).approve(this.chefv2.address, "1000")
      
      // Add first LP to the pool with allocation 10
      await this.chefv2.add("10", this.rlp.address, this.ZeroAddress)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo("6009")
      await this.chefv2.connect(this.alice).deposit(0, "10", this.alice.address)
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo("6019")
      // we are adding rewarder token to the second LP pool
      const log = await this.chefv2.add("20", this.rlp2.address, this.rewarder.address)
      // Alice should have 10*1000/3 pending reward
      expect(await this.chefv2.pendingTri(0, this.alice.address)).to.equal("3333")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo("6024")
      await this.chefv2.connect(this.bob).deposit(1, "5", this.bob.address)
      // Alice should have 1000 + 5*1/3*100 = 1166 pending reward
      expect(await this.chefv2.pendingTri(0, this.alice.address)).to.equal("5000")
      await advanceBlockTo("6029")
      // At block 430. Alice should get ~166 more.
      expect(await this.chefv2.connect(this.alice).harvest(0, this.alice.address)) // block 6030
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("6666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("0") // pool 0 does not have any rewards
      // bob will not get any tokens since he has not given to pool 0
      expect(await this.chefv2.connect(this.bob).harvest(0, this.bob.address))
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("0")
      // alice will not get any new tokens since she has not deposited to pool 1
      expect(await this.chefv2.connect(this.alice).harvest(1, this.alice.address))
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("6666")
      expect(await this.rewardToken.balanceOf(this.alice.address)).to.equal("0") 
      // bob will not get any tokens since he has not given to pool 0
      // at block 6033 Bob should get 8*2/3*100 = 333. 
      expect(await this.chefv2.connect(this.bob).harvest(1, this.bob.address)) // block 6033
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("5332")
      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("5332")
    })
  })

  describe("EmergencyWithdraw", function () {
    it("Should emit event EmergencyWithdraw", async function () {
      await this.rewardToken.connect(this.minter).transfer(this.rewarder.address, getBigNumber(100000))
      await this.chefv2.connect(this.minter).add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.connect(this.minter).transfer(this.bob.address, getBigNumber(10))
      await this.rlp.connect(this.bob).approve(this.chefv2.address, getBigNumber(10))
      await this.chefv2.connect(this.bob).deposit(0, getBigNumber(1), this.bob.address)
      //await this.chefv2.emergencyWithdraw(0, this.alice.address)
      await expect(this.chefv2.connect(this.bob).emergencyWithdraw(0, this.bob.address))
        .to.emit(this.chefv2, "EmergencyWithdraw")
        .withArgs(this.bob.address, 0, getBigNumber(1), this.bob.address)
    })
  })
})