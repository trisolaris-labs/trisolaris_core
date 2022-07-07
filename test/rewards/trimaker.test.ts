import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, createSLP } from "../utils";

describe("TriMaker", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];
    this.bob = this.signers[1];
    this.carol = this.signers[2];
    this.minter = this.signers[4];

    this.TriMaker = await ethers.getContractFactory("TriMaker");
    this.TriBar = await ethers.getContractFactory("TriBar");
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
    this.UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    this.UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
    this.TriMakerExploitMock = await ethers.getContractFactory("TriMakerExploitMock");
    this.ZeroAddress = "0x0000000000000000000000000000000000000000";
  });

  beforeEach(async function () {
    this.tri = await this.ERC20Mock.connect(this.minter).deploy("TRI", "TRI", 18, getBigNumber("10000000"));
    await this.tri.deployed();
    this.dai = await this.ERC20Mock.connect(this.minter).deploy("DAI", "DAI", 18, getBigNumber("10000000"));
    await this.dai.deployed();
    this.mic = await this.ERC20Mock.connect(this.minter).deploy("MIC", "MIC", 18, getBigNumber("10000000"));
    await this.mic.deployed();
    this.usdc = await this.ERC20Mock.connect(this.minter).deploy("USDC", "USDC", 18, getBigNumber("10000000"));
    await this.usdc.deployed();
    this.weth = await this.ERC20Mock.connect(this.minter).deploy("WETH", "ETH", 18, getBigNumber("10000000"));
    await this.usdc.deployed();
    this.strudel = await this.ERC20Mock.connect(this.minter).deploy("$TRDL", "$TRDL", 18, getBigNumber("10000000"));
    await this.strudel.deployed();
    this.factory = await this.UniswapV2Factory.connect(this.minter).deploy(this.minter.address);
    await this.factory.deployed();

    this.bar = await this.TriBar.connect(this.minter).deploy(this.tri.address);
    await this.bar.deployed();
    this.triMaker = await this.TriMaker.connect(this.minter).deploy(
      this.factory.address,
      this.bar.address,
      this.tri.address,
      this.weth.address,
    );
    await this.triMaker.deployed();
    this.exploiter = await this.TriMakerExploitMock.connect(this.minter).deploy(this.triMaker.address);
    await this.exploiter.deployed();

    await createSLP(this, "triEth", this.tri, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "strudelEth", this.strudel, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "daiEth", this.dai, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "usdcEth", this.usdc, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "micUSDC", this.mic, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "triUSDC", this.tri, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "daiUSDC", this.dai, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "daiMIC", this.dai, this.mic, getBigNumber(10), this.minter);
  });

  describe("setBridge", function () {
    it("does not allow to set bridge for Tri", async function () {
      await expect(this.triMaker.setBridge(this.tri.address, this.weth.address)).to.be.revertedWith(
        "TriMaker: Invalid bridge",
      );
    });

    it("does not allow to set bridge for WETH", async function () {
      await expect(this.triMaker.setBridge(this.weth.address, this.tri.address)).to.be.revertedWith(
        "TriMaker: Invalid bridge",
      );
    });

    it("does not allow to set bridge to itself", async function () {
      await expect(this.triMaker.setBridge(this.dai.address, this.dai.address)).to.be.revertedWith(
        "TriMaker: Invalid bridge",
      );
    });

    it("does not allow to non_owner to set bridge", async function () {
      await expect(this.triMaker.connect(this.alice).setBridge(this.mic.address, this.dai.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("emits correct event on bridge", async function () {
      await expect(this.triMaker.setBridge(this.dai.address, this.tri.address))
        .to.emit(this.triMaker, "LogBridgeSet")
        .withArgs(this.dai.address, this.tri.address);
    });
  });
  describe("convert", function () {
    it("should convert TRI - ETH", async function () {
      await this.triEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.connect(this.alice).convert(this.tri.address, this.weth.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.triEth.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1897569270781234370");
    });

    it("should convert USDC - ETH", async function () {
      await this.usdcEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.convert(this.usdc.address, this.weth.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.usdcEth.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("should convert $TRDL - ETH", async function () {
      await this.strudelEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.convert(this.strudel.address, this.weth.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.strudelEth.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("should convert USDC - TRI", async function () {
      await this.triUSDC.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.convert(this.usdc.address, this.tri.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.triUSDC.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1897569270781234370");
    });

    it("should convert using standard ETH path", async function () {
      await this.daiEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.convert(this.dai.address, this.weth.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.daiEth.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("converts MIC/USDC using more complex path", async function () {
      await this.micUSDC.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.setBridge(this.usdc.address, this.tri.address);
      await this.triMaker.setBridge(this.mic.address, this.usdc.address);
      await this.triMaker.convert(this.mic.address, this.usdc.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.micUSDC.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("converts DAI/USDC using more complex path", async function () {
      await this.daiUSDC.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.setBridge(this.usdc.address, this.tri.address);
      await this.triMaker.setBridge(this.dai.address, this.usdc.address);
      await this.triMaker.convert(this.dai.address, this.usdc.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.daiUSDC.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("converts DAI/MIC using two step path", async function () {
      await this.daiMIC.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.setBridge(this.dai.address, this.usdc.address);
      await this.triMaker.setBridge(this.mic.address, this.dai.address);
      await this.triMaker.convert(this.dai.address, this.mic.address);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.daiMIC.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("1200963016721363748");
    });

    it("reverts if it loops back", async function () {
      await this.daiMIC.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.setBridge(this.dai.address, this.mic.address);
      await this.triMaker.setBridge(this.mic.address, this.dai.address);
      await expect(this.triMaker.convert(this.dai.address, this.mic.address)).to.be.reverted;
    });

    it("reverts if caller is not EOA", async function () {
      await this.triEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await expect(this.exploiter.convert(this.tri.address, this.weth.address)).to.be.revertedWith(
        "TriMaker: must use EOA",
      );
    });

    it("reverts if pair does not exist", async function () {
      await expect(this.triMaker.convert(this.mic.address, this.micUSDC.address)).to.be.revertedWith(
        "TriMaker: Invalid pair",
      );
    });

    it("reverts if no path is available", async function () {
      await this.micUSDC.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await expect(this.triMaker.convert(this.mic.address, this.usdc.address)).to.be.revertedWith(
        "TriMaker: Cannot convert",
      );
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.micUSDC.balanceOf(this.triMaker.address)).to.equal(getBigNumber(1));
      expect(await this.tri.balanceOf(this.bar.address)).to.equal(0);
    });
  });

  describe("convertMultiple", function () {
    it("should allow to convert multiple", async function () {
      await this.daiEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await this.triMaker.convertMultiple([this.dai.address, this.tri.address], [this.weth.address, this.weth.address]);
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.daiEth.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("3186583558687783097");
    });
  });
});
