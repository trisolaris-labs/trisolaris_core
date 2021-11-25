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
    this.rlp = await this.ERC20Mock.connect(this.minter).deploy("LP", "rLPT", getBigNumber(100))
    await this.rlp.deployed()
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
          expect(e.toString()).to.equal("Error: VM Exception while processing transaction: invalid opcode")
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
      await advanceBlockTo(3)
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
      await advanceBlockTo(1)
      await this.chefv2.massUpdatePools([0])
      //expect('updatePool').to.be.calledOnContract(); //not suported by heardhat
      //expect('updatePool').to.be.calledOnContractWith(0); //not suported by heardhat
    })

    
    it("Updating invalid pools should fail", async function () {
      try {
        await this.chefv2.massUpdatePools([0, 10000, 100000])
      } catch (e: unknown) {
        if (e instanceof Error) (
          expect(e.toString()).to.equal("Error: VM Exception while processing transaction: invalid opcode")
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
      await advanceBlockTo(1)
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
          expect(e.toString()).to.equal("Error: VM Exception while processing transaction: invalid opcode")
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
      await advanceBlockTo(20)
      await this.chefv2.harvestFromMasterChef()
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