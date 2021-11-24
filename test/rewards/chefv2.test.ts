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
    this.chef = await this.MasterChef.deploy(this.tri.address, "1000", "0")
    await this.chef.deployed()
    this.lp = await this.ERC20Mock.deploy("LPToken", "LPT", getBigNumber(10))
    await this.lp.deployed()
    this.dummy = await this.ERC20Mock.deploy("Dummy", "DummyT", getBigNumber(10))
    await this.dummy.deployed()

    await this.tri.connect(this.minter).setMinter(this.chef.address)
    await this.chef.add(100, this.lp.address, this.ZeroAddress, true)
    await this.chef.add(100, this.dummy.address, this.ZeroAddress, true)

    await this.lp.transfer(this.alice.address, getBigNumber(10))
    await this.lp.connect(this.alice).approve(this.chef.address, getBigNumber(10))
    await this.chef.connect(this.alice).deposit(0, getBigNumber(10))
    
    this.chefv2 = await this.MasterChefV2.deploy(this.chef.address, this.tri.address, 1)
    await this.chefv2.deployed()
    this.rlp = await this.ERC20Mock.deploy("LP", "rLPT", getBigNumber(10))
    await this.rlp.deployed()
    this.rewardToken = await this.ERC20Mock.deploy("Reward", "RewardT", getBigNumber(10))
    await this.rewardToken.deployed()
    this.rewarder = await this.RewarderMock.deploy(getBigNumber(1), this.rewardToken.address, this.chefv2.address)
    await this.rewarder.deployed()

    await this.dummy.transfer(this.alice.address, getBigNumber(10))    
    await this.dummy.connect(this.alice).approve(this.chefv2.address, getBigNumber(10))
    await this.chefv2.connect(this.alice).init(this.dummy.address)
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
        await expect(this.chefv2.set(0, 10, this.rewarder.address, false)).to.be.revertedWith(" Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("PendingTri", function () {
    it("PendingTri should equal ExpectedTri", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      let log = await this.chefv2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.chefv2.updatePool(0)
      await advanceBlock()
      let expectedTri = getBigNumber(100)
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
      let expectedTri = getBigNumber(100)
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
        await expect(this.chefv2.massUpdatePools([0, 10000, 100000])).to.be.revertedWith("Error: VM Exception while processing transaction: invalid opcode")
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

    it("Should take else path", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await this.chefv2.batch(
        [this.chefv2.interface.encodeFunctionData("updatePool", [0]), this.chefv2.interface.encodeFunctionData("updatePool", [0])],
        true
      )
    })
  })

  describe("Deposit", function () {
    it("Depositing 0 amount", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      await expect(this.chefv2.deposit(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chefv2, "Deposit")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })

    it("Depositing into non-existent pool should fail", async function () {
      await expect(this.chefv2.deposit(1001, getBigNumber(0), this.alice.address)).to.be.revertedWith("Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Withdraw", function () {
    it("Withdraw 0 amount", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.chefv2.withdraw(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chefv2, "Withdraw")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })
  })

  describe("Harvest", function () {
    it("Should give back the correct amount of TRI and reward", async function () {
      await this.rewardToken.transfer(this.rewarder.address, getBigNumber(100000))
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      expect(await this.chefv2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chefv2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(20)
      await this.chefv2.harvestFromMasterChef()
      let log2 = await this.chefv2.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedTri = getBigNumber(100)
        .mul(log2.blockNumber - log.blockNumber)
        .div(2)
      expect((await this.chefv2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedTri)
      await this.chefv2.harvest(0, this.alice.address)
      expect(await this.tri.balanceOf(this.alice.address))
        .to.be.equal(await this.rewardToken.balanceOf(this.alice.address))
        .to.be.equal(expectedTri)
    })
    it("Harvest with empty user balance", async function () {
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.chefv2.harvest(0, this.alice.address)
    })

    it("Harvest for TRI-only pool", async function () {
      await this.chefv2.add(10, this.rlp.address, this.ZeroAddress)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      expect(await this.chefv2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chefv2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      await this.chefv2.harvestFromMasterChef()
      let log2 = await this.chefv2.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedTri = getBigNumber(100)
        .mul(log2.blockNumber - log.blockNumber)
        .div(2)
      expect((await this.chefv2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedTri)
      await this.chefv2.harvest(0, this.alice.address)
      expect(await this.tri.balanceOf(this.alice.address)).to.be.equal(expectedTri)
    })
  })

  describe("EmergencyWithdraw", function () {
    it("Should emit event EmergencyWithdraw", async function () {
      await this.rewardToken.transfer(this.rewarder.address, getBigNumber(100000))
      await this.chefv2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chefv2.address, getBigNumber(10))
      await this.chefv2.deposit(0, getBigNumber(1), this.bob.address)
      //await this.chefv2.emergencyWithdraw(0, this.alice.address)
      await expect(this.chefv2.connect(this.bob).emergencyWithdraw(0, this.bob.address))
        .to.emit(this.chefv2, "EmergencyWithdraw")
        .withArgs(this.bob.address, 0, getBigNumber(1), this.bob.address)
    })
  })
})