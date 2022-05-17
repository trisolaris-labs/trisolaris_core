import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, createSLP, setupStableSwap, asyncForEach } from "../utils";

describe("StableTriMaker", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.alice = this.signers[0];
    this.bob = this.signers[1];
    this.carol = this.signers[2];
    this.minter = this.signers[4];

    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    this.TriMaker = await ethers.getContractFactory("StableTriMaker");
    this.TriBar = await ethers.getContractFactory("TriBar");
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
    this.UniswapV2Router = await ethers.getContractFactory("UniswapV2Router02");
    this.UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    this.UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
    this.TriMakerExploitMock = await ethers.getContractFactory("StableTriMakerExploitMock");
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
    this.usdt = await this.ERC20Mock.connect(this.minter).deploy("USDT", "USDT", 18, getBigNumber("300"));
    await this.usdt.deployed();
    this.usn = await this.ERC20Mock.connect(this.minter).deploy("USN", "USN", 18, getBigNumber("300"));
    await this.usn.deployed();
    this.factory = await this.UniswapV2Factory.connect(this.minter).deploy(this.minter.address);
    await this.factory.deployed();
    this.router = await this.UniswapV2Router.connect(this.minter).deploy(this.factory.address, this.weth.address);
    await this.factory.deployed();

    this.bar = await this.TriBar.connect(this.minter).deploy(this.tri.address);
    await this.bar.deployed();
    this.triMaker = await this.TriMaker.connect(this.minter).deploy(
      this.router.address,
      this.bar.address,
      this.usn.address,
    );
    await this.triMaker.deployed();
    this.exploiter = await this.TriMakerExploitMock.connect(this.minter).deploy(this.triMaker.address);
    await this.exploiter.deployed();

    await createSLP(this, "triEth", this.tri, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "strudelEth", this.strudel, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "daiEth", this.dai, this.weth, getBigNumber(1000), this.minter);
    await createSLP(this, "usdcEth", this.usdc, this.weth, getBigNumber(10), this.minter);
    await createSLP(this, "micUSDC", this.mic, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "triUSDC", this.tri, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "daiTri", this.dai, this.tri, getBigNumber(10), this.minter);
    await createSLP(this, "usdtTri", this.usdt, this.tri, getBigNumber(10), this.minter);
    await createSLP(this, "daiUSDC", this.dai, this.usdc, getBigNumber(10), this.minter);
    await createSLP(this, "daiMIC", this.dai, this.mic, getBigNumber(10), this.minter);

    this.owner = this.signers[0];
    this.user1 = this.signers[1];
    this.user2 = this.signers[2];
    await setupStableSwap(this, this.owner);

    // transferring to users
    await this.dai.connect(this.minter).transfer(this.user1.address, getBigNumber("100"));
    await this.usdt.connect(this.minter).transfer(this.user1.address, getBigNumber("100"));
    await this.dai.connect(this.minter).transfer(this.user2.address, getBigNumber("100"));
    await this.usdt.connect(this.minter).transfer(this.user2.address, getBigNumber("100"));

    // Constructor arguments
    const TOKEN_ADDRESSES = [this.dai.address, this.usdt.address, this.usn.address];
    const TOKEN_DECIMALS = [18, 18, 18];
    this.LP_TOKEN_NAME = "Saddle DAI/USDC/USN";
    this.LP_TOKEN_SYMBOL = "saddleTestUSD";
    this.INITIAL_A = 50;
    this.SWAP_FEE = 1e6; // 1bps
    this.ADMIN_FEE = 0;

    await this.swapFlashLoan
      .connect(this.owner)
      .initialize(
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        this.LP_TOKEN_NAME,
        this.LP_TOKEN_SYMBOL,
        this.INITIAL_A,
        this.SWAP_FEE,
        this.ADMIN_FEE,
        this.lpTokenBase.address,
      );
    const swapStorage = await this.swapFlashLoan.swapStorage();
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.swapToken = LpTokenFactory.attach(swapStorage.lpToken);

    expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq(0);

    const testSwapReturnValuesFactory = await ethers.getContractFactory("TestSwapReturnValues");
    this.testSwapReturnValues = await testSwapReturnValuesFactory.deploy(
      this.swapFlashLoan.address,
      this.swapToken.address,
      3,
    );

    await this.dai.connect(this.minter).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.usdt.connect(this.minter).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.usn.connect(this.minter).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.dai.connect(this.minter).transfer(this.owner.address, getBigNumber("10"));
    await this.usdt.connect(this.minter).transfer(this.owner.address, getBigNumber("10"));
    await this.usn.connect(this.minter).transfer(this.owner.address, getBigNumber("10"));
    await this.dai.connect(this.minter).transfer(this.factory.address, getBigNumber("10"));
    await this.usdt.connect(this.minter).transfer(this.factory.address, getBigNumber("10"));
    await this.usn.connect(this.minter).transfer(this.factory.address, getBigNumber("10"));
    await this.tri.connect(this.minter).transfer(this.factory.address, getBigNumber("10"));

    await asyncForEach([this.owner, this.user1, this.user2], async signer => {
      await this.dai.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.usdt.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.usn.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.swapToken.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
    });
    await this.swapFlashLoan.addLiquidity([String(1e18), String(1e18), String(1e18)], 0, this.MAX_UINT256);

    expect(await this.dai.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));
    expect(await this.usdt.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));
    expect(await this.usn.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));

    await this.swapToken
      .connect(this.owner)
      .transfer(this.triMaker.address, await this.swapToken.balanceOf(this.owner.address));
    expect(await this.swapToken.balanceOf(this.triMaker.address)).to.be.gt(0);

    await createSLP(this, "usdtEth", this.usdt, this.weth, getBigNumber(10), this.minter);

    await this.swapFlashLoan.connect(this.owner).setFeeAddress(this.triMaker.address);
    await this.swapFlashLoan.setAdminFee(getBigNumber(10, 8));
    await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
    await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
  });

  describe("convertStables", function () {
    it("should convert DAI/USDT - USN via stableswap amm", async function () {
      expect(await this.usn.balanceOf(this.bar.address)).to.equal("0");
      await this.triMaker.convertStables(
        this.swapFlashLoan.address,
        [this.dai.address, this.usdt.address],
        [
          [this.dai.address, this.usn.address],
          [this.usdt.address, this.usn.address],
        ],
      );
      expect(await this.usn.balanceOf(this.triMaker.address)).to.equal(0);
      expect(await this.usn.balanceOf(this.bar.address)).to.equal("1993999605348");
    });

    it("should convert more DAI/USDT - USN via stableswap amm if sent more DAI (from TriMaker)", async function () {
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("0");
      await expect(
        this.triMaker.convertStables(
          this.swapFlashLoan.address,
          [this.dai.address, this.usdt.address],
          [
            [this.dai.address, this.tri.address],
            [this.usdt.address, this.dai.address],
          ],
        ),
      ).to.be.revertedWith("StableTriMaker: invalid tri conversion path");
    });

    it("should fail convert DAI/USDT - USN: no more to stables to convert", async function () {
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("0");
      await expect(
        this.triMaker.convertStables(
          this.swapFlashLoan.address,
          [this.dai.address, this.usdt.address],
          [
            [this.tri.address, this.tri.address],
            [this.usdt.address, this.tri.address],
          ],
        ),
      ).to.be.revertedWith("StableTriMaker: invalid tri conversion path");
    });

    it("should revert if caller is not EOA", async function () {
      await this.triEth.connect(this.minter).transfer(this.triMaker.address, getBigNumber(1));
      await expect(
        this.exploiter.convertStables(
          this.swapFlashLoan.address,
          [this.dai.address, this.usdt.address],
          [
            [this.dai.address, this.tri.address],
            [this.usdt.address, this.dai.address],
          ],
        ),
      ).to.be.revertedWith("StableTriMaker: must use EOA");
    });
  });

  describe("sendUsnToLPMaker", () => {
    it("should sendUsnToLPMaker if has balance", async function () {
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("0");
      await this.tri.transfer(this.triMaker.address, getBigNumber("1"));
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal(getBigNumber("1"));
      this.triMaker.sendTriToBar();
      expect(await this.tri.balanceOf(this.triMaker.address)).to.equal("0");
      expect(await this.tri.balanceOf(this.bar.address)).to.equal(getBigNumber("1"));
    });

    it("should fail sendUsnToLPMaker: if not enough usn", async function () {
      expect(await this.tri.balanceOf(this.bar.address)).to.equal("0");
      await expect(this.triMaker.sendTriToBar()).to.be.revertedWith("StableTriMaker: no Usn to send");
    });
  });

  describe("withdrawStableTokenFees", () => {
    it("should withdraw stable tokens accrued as stable swaps", async function () {
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("0");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("0");
      await this.triMaker.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("1001975663797");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("998024139765");
    });
  });

  describe("setStableSwap", () => {
    it("should setStableSwap if owner", async function () {
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("0");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("0");
      await this.triMaker.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("1001975663797");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("998024139765");
    });

    it("should fail setStableSwap if not owner", async function () {
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("0");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("0");
      await this.triMaker.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("1001975663797");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("998024139765");
    });
  });

  describe("setLPMaker", () => {
    it("should setLPMaker if owner", async function () {
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("0");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("0");
      await this.triMaker.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("1001975663797");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("998024139765");
    });

    it("should fail setLPMaker if not owner", async function () {
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("0");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("0");
      await this.triMaker.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.dai.balanceOf(this.triMaker.address)).to.equal("1001975663797");
      expect(await this.usdt.balanceOf(this.triMaker.address)).to.equal("998024139765");
    });
  });
});
