import { expect } from "chai";
import { prepare, deploy, getBigNumber, createSLP } from "./utilities"

describe("TriMaker", function () {
  before(async function () {
    await prepare(this, ["TriMaker", "TriBar", "TriMakerExploitMock", "ERC20Mock", "UniswapV2Factory", "UniswapV2Pair"])
  })

  beforeEach(async function () {
    await deploy(this, [
      ["tri", this.ERC20Mock, ["TRI", "TRI", getBigNumber("10000000")]],
      ["dai", this.ERC20Mock, ["DAI", "DAI", getBigNumber("10000000")]],
      ["mic", this.ERC20Mock, ["MIC", "MIC", getBigNumber("10000000")]],
      ["usdc", this.ERC20Mock, ["USDC", "USDC", getBigNumber("10000000")]],
      ["weth", this.ERC20Mock, ["WETH", "ETH", getBigNumber("10000000")]],
      ["strudel", this.ERC20Mock, ["$TRDL", "$TRDL", getBigNumber("10000000")]],
      ["factory", this.UniswapV2Factory, [this.alice.address]],
    ])
    await deploy(this, [["bar", this.TriBar, [this.tri.address]]])
    await deploy(this, [["triMaker", this.TriMaker, [this.factory.address, this.bar.address, this.tri.address, this.weth.address]]])
    await deploy(this, [["exploiter", this.TriMakerExploitMock, [this.triMaker.address]]])
    await createSLP(this, "triEth", this.tri, this.weth, getBigNumber(10))
    await createSLP(this, "strudelEth", this.strudel, this.weth, getBigNumber(10))
    await createSLP(this, "daiEth", this.dai, this.weth, getBigNumber(10))
    await createSLP(this, "usdcEth", this.usdc, this.weth, getBigNumber(10))
    await createSLP(this, "micUSDC", this.mic, this.usdc, getBigNumber(10))
    await createSLP(this, "triUSDC", this.tri, this.usdc, getBigNumber(10))
    await createSLP(this, "daiUSDC", this.dai, this.usdc, getBigNumber(10))
    await createSLP(this, "daiMIC", this.dai, this.mic, getBigNumber(10))
  })
  describe("setBridge", function () {
    it("does not allow to set bridge for Tri", async function () {
      await expect(this.triMaker.setBridge(this.tri.address, this.weth.address)).to.be.revertedWith("TriMaker: Invalid bridge")
    })

    it("does not allow to set bridge for WETH", async function () {
      await expect(this.triMaker.setBridge(this.weth.address, this.tri.address)).to.be.revertedWith("TriMaker: Invalid bridge")
    })

    it("does not allow to set bridge to itself", async function () {
      await expect(this.triMaker.setBridge(this.dai.address, this.dai.address)).to.be.revertedWith("TriMaker: Invalid bridge")
    })

    it("emits correct event on bridge", async function () {
      await expect(this.triMaker.setBridge(this.dai.address, this.tri.address))
        .to.emit(this.triMaker, "LogBridgeSet")
        .withArgs(this.dai.address, this.tri.address)
    })
  })
  describe("convert", function () {
    it("should convert TRI - ETH", async function () {
      await this.triEth.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.convert(this.tri.address, this.weth.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.triEth.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1897569270781234370")
    })

    it("should convert USDC - ETH", async function () {
      await this.usdcEth.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.convert(this.usdc.address, this.weth.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.usdcEth.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("should convert $TRDL - ETH", async function () {
      await this.strudelEth.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.convert(this.strudel.address, this.weth.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.strudelEth.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("should convert USDC - TRI", async function () {
      await this.triUSDC.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.convert(this.usdc.address, this.tri.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.triUSDC.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1897569270781234370")
    })

    it("should convert using standard ETH path", async function () {
      await this.daiEth.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.convert(this.dai.address, this.weth.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.daiEth.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("converts MIC/USDC using more complex path", async function () {
      await this.micUSDC.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.setBridge(this.usdc.address, this.tri.address)
      await this.triMaker.setBridge(this.mic.address, this.usdc.address)
      await this.triMaker.convert(this.mic.address, this.usdc.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.micUSDC.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("converts DAI/USDC using more complex path", async function () {
      await this.daiUSDC.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.setBridge(this.usdc.address, this.tri.address)
      await this.triMaker.setBridge(this.dai.address, this.usdc.address)
      await this.triMaker.convert(this.dai.address, this.usdc.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.daiUSDC.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275")
    })

    it("converts DAI/MIC using two step path", async function () {
      await this.daiMIC.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.setBridge(this.dai.address, this.usdc.address)
      await this.triMaker.setBridge(this.mic.address, this.dai.address)
      await this.triMaker.convert(this.dai.address, this.mic.address)
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.daiMIC.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1200963016721363748")
    })

    it("reverts if it loops back", async function () {
      await this.daiMIC.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.setBridge(this.dai.address, this.mic.address)
      await this.triMaker.setBridge(this.mic.address, this.dai.address)
      await expect(this.triMaker.convert(this.dai.address, this.mic.address)).to.be.reverted
    })

    it("reverts if caller is not EOA", async function () {
      await this.triEth.transfer(this.triMaker.address, getBigNumber(1))
      await expect(this.exploiter.convert(this.tri.address, this.weth.address)).to.be.revertedWith("TriMaker: must use EOA")
    })

    it("reverts if pair does not exist", async function () {
      await expect(this.triMaker.convert(this.mic.address, this.micUSDC.address)).to.be.revertedWith("TriMaker: Invalid pair")
    })

    it("reverts if no path is available", async function () {
      await this.micUSDC.transfer(this.triMaker.address, getBigNumber(1))
      await expect(this.triMaker.convert(this.mic.address, this.usdc.address)).to.be.revertedWith("TriMaker: Cannot convert")
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.micUSDC.balanceOf(this.triMaker.address)).to.equal(getBigNumber(1))
      expect(await this.tri.balanceOf(this.bar.address)).to.equal(0)
    })
  })

  describe("convertMultiple", function () {
    it("should allow to convert multiple", async function () {
      await this.daiEth.transfer(this.triMaker.address, getBigNumber(1))
      await this.triEth.transfer(this.triMaker.address, getBigNumber(1))
      await this.triMaker.convertMultiple([this.dai.address, this.tri.address], [this.weth.address, this.weth.address])
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.daiEth.balanceOf(this.triMaker.address)).to.equal(0)
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("3186583558687783097")
    })
  })
})