import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, createSLP } from "../utils";

describe("UsdcMaker", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];
    this.bob = this.signers[1];
    this.carol = this.signers[2];
    this.minter = this.signers[4];

    this.UsdcMaker = await ethers.getContractFactory("UsdcMaker");
    this.TriBar = await ethers.getContractFactory("TriBar");
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
    this.UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    this.UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
    this.UsdcMakerExploitMock = await ethers.getContractFactory("UsdcMakerExploitMock");
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
    await this.weth.deployed();
    this.strudel = await this.ERC20Mock.connect(this.minter).deploy("$TRDL", "$TRDL", 18, getBigNumber("10000000"));
    await this.strudel.deployed();
    this.factory = await this.UniswapV2Factory.connect(this.minter).deploy(this.minter.address);
    await this.factory.deployed();

    this.bar = await this.TriBar.connect(this.minter).deploy(this.tri.address);
    await this.bar.deployed();
    this.usdcMaker = await this.UsdcMaker.connect(this.minter).deploy(
      this.factory.address,
      this.bar.address,
      this.usdc.address,
      this.weth.address,
    );
    await this.usdcMaker.deployed();
    this.exploiter = await this.UsdcMakerExploitMock.connect(this.minter).deploy(this.usdcMaker.address);
    await this.exploiter.deployed();

    await createSLP(this, "triEth", this.tri, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "strudelEth", this.strudel, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "daiEth", this.dai, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "usdcEth", this.usdc, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "micTRI", this.mic, this.tri, getBigNumber(10), this.minter);
    await createSLP(this, "triUSDC", this.tri, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "daiTRI", this.dai, this.tri, getBigNumber(10), this.minter);
    await createSLP(this, "daiMIC", this.dai, this.mic, getBigNumber(10), this.minter);
  });

  describe("setBridge", function () {
    it("does not allow to set bridge for Usdc", async function () {
      await expect(this.usdcMaker.setBridge(this.usdc.address, this.weth.address)).to.be.revertedWith(
        "UsdcMaker: Invalid bridge",
      );
    });

    it("does not allow to set bridge for WETH", async function () {
      await expect(this.usdcMaker.setBridge(this.weth.address, this.usdc.address)).to.be.revertedWith(
        "UsdcMaker: Invalid bridge",
      );
    });

    it("does not allow to set bridge to itself", async function () {
      await expect(this.usdcMaker.setBridge(this.dai.address, this.dai.address)).to.be.revertedWith(
        "UsdcMaker: Invalid bridge",
      );
    });

    it("does not allow to non_owner to set bridge", async function () {
      await expect(this.usdcMaker.connect(this.alice).setBridge(this.mic.address, this.dai.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("emits correct event on bridge", async function () {
      await expect(this.usdcMaker.setBridge(this.dai.address, this.tri.address))
        .to.emit(this.usdcMaker, "LogBridgeSet")
        .withArgs(this.dai.address, this.tri.address);
    });
  });
  describe("convert", function () {
    it("should convert TRI - ETH", async function () {
      await this.triEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.connect(this.alice).convert(this.tri.address, this.weth.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.triEth.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("should convert USDC - ETH", async function () {
      await this.usdcEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.convert(this.usdc.address, this.weth.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdcEth.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1897569270781234370");
    });

    it("should convert $TRDL - ETH", async function () {
      await this.strudelEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.convert(this.strudel.address, this.weth.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.strudelEth.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("should convert USDC - TRI", async function () {
      await this.triUSDC.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.convert(this.usdc.address, this.tri.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.triUSDC.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1897569270781234370");
    });

    it("should convert using standard ETH path", async function () {
      await this.daiEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.convert(this.dai.address, this.weth.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.daiEth.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("converts MIC/TRI using more complex path", async function () {
      await this.micTRI.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.setBridge(this.tri.address, this.usdc.address);
      await this.usdcMaker.setBridge(this.mic.address, this.tri.address);
      await this.usdcMaker.convert(this.mic.address, this.tri.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.micTRI.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("converts DAI/TRI using more complex path", async function () {
      await this.daiTRI.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.setBridge(this.tri.address, this.usdc.address);
      await this.usdcMaker.setBridge(this.dai.address, this.tri.address);
      await this.usdcMaker.convert(this.dai.address, this.tri.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.micTRI.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1590898251382934275");
    });

    it("converts DAI/MIC using two step path", async function () {
      await this.daiMIC.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.setBridge(this.dai.address, this.tri.address);
      await this.usdcMaker.setBridge(this.mic.address, this.dai.address);
      await this.usdcMaker.convert(this.dai.address, this.mic.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.daiMIC.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("1200963016721363748");
    });

    it("reverts if it loops back", async function () {
      await this.daiMIC.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.setBridge(this.dai.address, this.mic.address);
      await this.usdcMaker.setBridge(this.mic.address, this.dai.address);
      await expect(this.usdcMaker.convert(this.dai.address, this.mic.address)).to.be.reverted;
    });

    it("reverts if caller is not EOA", async function () {
      await this.triEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await expect(this.exploiter.convert(this.tri.address, this.weth.address)).to.be.revertedWith(
        "UsdcMaker: must use EOA",
      );
    });

    it("reverts if pair does not exist", async function () {
      await expect(this.usdcMaker.convert(this.mic.address, this.micTRI.address)).to.be.revertedWith(
        "UsdcMaker: Invalid pair",
      );
    });

    it("reverts if no path is available", async function () {
      await this.micTRI.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await expect(this.usdcMaker.convert(this.mic.address, this.tri.address)).to.be.revertedWith(
        "UsdcMaker: Cannot convert",
      );
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.micTRI.balanceOf(this.usdcMaker.address)).to.equal(getBigNumber(1));
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal(0);
    });
  });

  describe("convertMultiple", function () {
    it("should allow to convert multiple", async function () {
      await this.daiEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.triEth.connect(this.minter).transfer(this.usdcMaker.address, getBigNumber(1));
      await this.usdcMaker.convertMultiple([this.dai.address, this.tri.address], [this.weth.address, this.weth.address]);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.daiEth.balanceOf(this.usdcMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.bar.address)).to.equal("2744605420302774516");
    });
  });

  describe("setStableLpMaker", () => {
    it("should only setStableLpMaker if owner", async function () {
      await expect(this.usdcMaker.connect(this.minter).setStableLpMaker(this.alice.address))
        .to.emit(this.usdcMaker, "LogSetStableLpMaker")
        .withArgs(this.bar.address, this.alice.address);
      expect(await this.usdcMaker.stablelpmaker()).to.equal(this.alice.address);
    });

    it("should not be able to setStableLpMaker if not owner", async function () {
      await expect(this.usdcMaker.connect(this.alice).setStableLpMaker(this.bob.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("reclaimTokens", () => {
    it("should allow owner and only owner to withdraw remaining funds", async function () {
      // balance of usdc 0 initially
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal("0");

      await this.usdc.transfer(this.usdcMaker.address, "1000");
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal("1000");

      await expect(
        this.usdcMaker.connect(this.bob).reclaimTokens(this.usdc.address, 1000, this.bob.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // checking balance after claiming tokens
      await this.usdcMaker.connect(this.minter).reclaimTokens(this.usdc.address, 1000, this.bob.address);
      expect(await this.usdc.balanceOf(this.usdcMaker.address)).to.equal("0");
      expect(await this.usdc.balanceOf(this.bob.address)).to.equal("1000");
    });
  });
});
