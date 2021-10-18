
import { ethers } from "hardhat";
import { expect } from "chai";
import { advanceBlockTo } from "../time"

describe("MasterChef", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.minter = this.signers[4]

    this.MasterChef = await ethers.getContractFactory("MasterChef")
    this.TriToken = await ethers.getContractFactory("Tri")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
  })

  beforeEach(async function () {
    this.tri = await this.TriToken.deploy(this.minter.address)
    await this.tri.deployed()
  })

  it("should set correct state variables", async function () {
    this.chef = await this.MasterChef.deploy(this.tri.address, "1000", "0")
    await this.chef.deployed()

    await this.tri.connect(this.minter).setMinter(this.chef.address)

    const tri = await this.chef.tri()
    const minter = await this.tri.minter()

    expect(tri).to.equal(this.tri.address)
    expect(minter).to.equal(this.chef.address)
  })

  it("should allow owner and only owner to update sushi per block", async function () {
    this.chef = await this.MasterChef.deploy(this.tri.address, "1000", "0")
    await this.chef.deployed()

    expect(await this.chef.sushiPerBlock()).to.equal(1000)

    await expect(this.chef.connect(this.bob).updateSushiPerBlock(1, { from: this.bob.address })).to.be.revertedWith("Ownable: caller is not the owner")

    await this.chef.connect(this.alice).updateSushiPerBlock(1, { from: this.alice.address })

    expect(await this.chef.sushiPerBlock()).to.equal(1)
  })

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")

      await this.lp.transfer(this.alice.address, "1000")

      await this.lp.transfer(this.bob.address, "1000")

      await this.lp.transfer(this.carol.address, "1000")

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000")

      await this.lp2.transfer(this.alice.address, "1000")

      await this.lp2.transfer(this.bob.address, "1000")

      await this.lp2.transfer(this.carol.address, "1000")
    })
  
    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.tri.address, "100", "100")
      await this.chef.deployed()

      await this.chef.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.chef.address, "1000")

      await this.chef.connect(this.bob).deposit(0, "100")

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900")

      await this.chef.connect(this.bob).emergencyWithdraw(0)

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should give out SUSHIs only after farming time", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.tri.address, "100", "100")
      await this.chef.deployed()

      await this.tri.connect(this.minter).setMinter(this.chef.address)

      await this.chef.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      await this.chef.connect(this.bob).deposit(0, "100")
      await advanceBlockTo("89")

      await this.chef.connect(this.bob).deposit(0, "0") // block 90
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("94")

      await this.chef.connect(this.bob).deposit(0, "0") // block 95
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("99")

      await this.chef.connect(this.bob).deposit(0, "0") // block 100
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("100")

      await this.chef.connect(this.bob).deposit(0, "0") // block 101
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("100")

      await advanceBlockTo("104")
      await this.chef.connect(this.bob).deposit(0, "0") // block 105

      expect(await this.tri.balanceOf(this.bob.address)).to.equal("500")
      expect(await this.tri.totalSupply()).to.equal("500")
    })

    it("should not distribute SUSHIs if no one deposit", async function () {
      // 100 per block farming rate starting at block 200 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.tri.address, "100", "200")
      await this.chef.deployed()
      await this.tri.connect(this.minter).setMinter(this.chef.address)
      
      await this.chef.add("100", this.lp.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      await advanceBlockTo("199")
      expect(await this.tri.totalSupply()).to.equal("0")
      await advanceBlockTo("204")
      expect(await this.tri.totalSupply()).to.equal("0")
      await advanceBlockTo("209")
      await this.chef.connect(this.bob).deposit(0, "10") // block 210
      expect(await this.tri.totalSupply()).to.equal("0")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("990")
      await advanceBlockTo("219")
      await this.chef.connect(this.bob).withdraw(0, "10") // block 220
      expect(await this.tri.totalSupply()).to.equal("1000")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should distribute SUSHIs properly for each staker", async function () {
      // 1000 per block farming rate starting at block 300
      this.chef = await this.MasterChef.deploy(this.tri.address, "1000", "300")
      await this.chef.deployed()
      await this.tri.connect(this.minter).setMinter(this.chef.address)
      await this.chef.add("100", this.lp.address, true)
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
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo("313")
      await this.chef.connect(this.bob).deposit(0, "20", { from: this.bob.address })
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("317")
      await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address })
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334
      await advanceBlockTo("319")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      expect(await this.tri.totalSupply()).to.equal("10000")
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.tri.balanceOf(this.chef.address)).to.equal("4334")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo("329")
      await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address })
      expect(await this.tri.totalSupply()).to.equal("20000")
      expect(await this.tri.balanceOf(this.alice.address)).to.equal("5666")
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("6190")
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
      // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
      expect(await this.tri.balanceOf(this.bob.address)).to.equal("11831")
      // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
      expect(await this.tri.balanceOf(this.carol.address)).to.equal("26568")
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000")
    })

    it("should give proper SUSHIs allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400
      this.chef = await this.MasterChef.deploy(this.tri.address, "100", "400")
      await this.tri.connect(this.minter).setMinter(this.chef.address)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address })
      await this.lp2.connect(this.bob).approve(this.chef.address, "1000", { from: this.bob.address })
      // Add first LP to the pool with allocation 1
      await this.chef.add("10", this.lp.address, true)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo("409")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo("419")
      await this.chef.add("20", this.lp2.address, true)
      // Alice should have 10*1000 pending reward
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1000")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo("424")
      await this.chef.connect(this.bob).deposit(1, "5", { from: this.bob.address })
      // Alice should have 1000 + 5*1/3*100 = 1166 pending reward
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1166")
      await advanceBlockTo("430")
      // At block 430. Bob should get 5*2/3*100 = 333. Alice should get ~166 more.
      expect(await this.chef.pendingSushi(0, this.alice.address)).to.equal("1333")
      expect(await this.chef.pendingSushi(1, this.bob.address)).to.equal("333")
    })

  })
})