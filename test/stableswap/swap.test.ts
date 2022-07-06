import { BigNumber, Signer } from "ethers";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  TIME,
  setupStableSwap,
  getBigNumber,
  asyncForEach,
  getUserTokenBalances,
  getUserTokenBalance,
  getCurrentBlockTimestamp,
  setTimestamp,
  forceAdvanceOneBlock,
} from "../utils";

import chai from "chai";

chai.use(solidity);
const { expect } = chai;

describe("Swap", function () {
  beforeEach(async function () {
    this.signers = await ethers.getSigners();
    this.owner = this.signers[0];
    this.user1 = this.signers[1];
    this.user2 = this.signers[2];

    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    await setupStableSwap(this, this.owner);

    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner);
    this.dai = await ERC20Mock.connect(this.owner).deploy("DAI", "DAI", 18, getBigNumber("300"));
    await this.dai.deployed();
    this.usdt = await ERC20Mock.connect(this.owner).deploy("USDT", "USDT", 18, getBigNumber("300"));
    await this.usdt.deployed();
    // transferring to users
    await this.dai.transfer(this.user1.address, getBigNumber("100"));
    await this.dai.transfer(this.user2.address, getBigNumber("100"));
    await this.usdt.transfer(this.user1.address, getBigNumber("100"));
    await this.usdt.transfer(this.user2.address, getBigNumber("100"));

    // Constructor arguments
    const TOKEN_ADDRESSES = [this.dai.address, this.usdt.address];
    const TOKEN_DECIMALS = [18, 18];
    this.LP_TOKEN_NAME = "Saddle DAI/USDC";
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
      2,
    );

    await this.dai.connect(this.owner).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.usdt.connect(this.owner).transfer(this.testSwapReturnValues.address, getBigNumber("10"));

    await asyncForEach([this.owner, this.user1, this.user2], async signer => {
      await this.dai.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.usdt.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.swapToken.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
    });
    await this.swapFlashLoan.addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);

    expect(await this.dai.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));
    expect(await this.usdt.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));
  });

  describe("swapStorage", function () {
    describe("lpToken", async function () {
      it("Returns correct lpTokenName", async function () {
        expect(await this.swapToken.name()).to.eq(this.LP_TOKEN_NAME);
      });

      it("Returns correct lpTokenSymbol", async function () {
        expect(await this.swapToken.symbol()).to.eq(this.LP_TOKEN_SYMBOL);
      });

      it("Returns true after successfully calling transferFrom", async function () {
        // User 1 adds liquidity
        await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);

        // User 1 approves User 2 for this.MAX_UINT256
        this.swapToken.connect(this.user1).approve(this.user2.address, this.MAX_UINT256);

        // User 2 transfers 1337 from User 1 to themselves using transferFrom
        await this.swapToken.connect(this.user2).transferFrom(this.user1.address, this.user2.address, 1337);

        expect(await this.swapToken.balanceOf(this.user2.address)).to.eq(1337);
      });
    });

    describe("A", async function () {
      it("Returns correct A value", async function () {
        expect(await this.swapFlashLoan.getA()).to.eq(this.INITIAL_A);
        expect(await this.swapFlashLoan.getAPrecise()).to.eq(this.INITIAL_A * 100);
      });
    });

    describe("fee", async function () {
      it("Returns correct fee value", async function () {
        expect((await this.swapFlashLoan.swapStorage()).swapFee).to.eq(this.SWAP_FEE);
      });
    });

    describe("adminFee", async function () {
      it("Returns correct adminFee value", async function () {
        expect((await this.swapFlashLoan.swapStorage()).adminFee).to.eq(this.ADMIN_FEE);
      });
    });
  });

  describe("feeAddress", () => {
    it("Returns correct addresses of fee address", async function () {
      expect(await this.swapFlashLoan.feeAddress()).to.eq(this.owner.address);
    });
  });

  describe("getToken", () => {
    it("Returns correct addresses of pooled tokens", async function () {
      expect(await this.swapFlashLoan.getToken(0)).to.eq(this.dai.address);
      expect(await this.swapFlashLoan.getToken(1)).to.eq(this.usdt.address);
    });

    it("Reverts when index is out of range", async function () {
      await expect(this.swapFlashLoan.getToken(2)).to.be.reverted;
    });
  });

  describe("getTokenIndex", () => {
    it("Returns correct token indexes", async function () {
      expect(await this.swapFlashLoan.getTokenIndex(this.dai.address)).to.be.eq(0);
      expect(await this.swapFlashLoan.getTokenIndex(this.usdt.address)).to.be.eq(1);
    });

    it("Reverts when token address is not found", async function () {
      await expect(this.swapFlashLoan.getTokenIndex(this.ZERO_ADDRESS)).to.be.revertedWith("Token does not exist");
    });
  });

  describe("getTokenBalance", () => {
    it("Returns correct balances of pooled tokens", async function () {
      expect(await this.swapFlashLoan.getTokenBalance(0)).to.eq(BigNumber.from(String(1e18)));
      expect(await this.swapFlashLoan.getTokenBalance(1)).to.eq(BigNumber.from(String(1e18)));
    });

    it("Reverts when index is out of range", async function () {
      await expect(this.swapFlashLoan.getTokenBalance(2)).to.be.reverted;
    });
  });

  describe("addLiquidity", () => {
    it("Reverts when contract is paused", async function () {
      await this.swapFlashLoan.pause();

      await expect(
        this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256),
      ).to.be.reverted;

      // unpause
      await this.swapFlashLoan.unpause();

      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256);

      const actualPoolTokenAmount = await this.swapToken.balanceOf(this.user1.address);
      expect(actualPoolTokenAmount).to.eq(BigNumber.from("3992573549245912340"));
    });

    it("Reverts with 'Amounts must match pooled tokens'", async function () {
      await expect(
        this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e16)], 0, this.MAX_UINT256),
      ).to.be.revertedWith("Amounts must match pooled tokens");
    });

    it("Reverts with 'Cannot withdraw more than available'", async function () {
      await expect(
        this.swapFlashLoan.connect(this.user1).calculateTokenAmount([this.MAX_UINT256, String(3e18)], false),
      ).to.be.revertedWith("Cannot withdraw more than available");
    });

    it("Reverts with 'Must supply all tokens in pool'", async function () {
      this.swapToken.approve(this.swapFlashLoan.address, String(2e18));
      await this.swapFlashLoan.removeLiquidity(String(2e18), [0, 0], this.MAX_UINT256);
      await expect(
        this.swapFlashLoan.connect(this.user1).addLiquidity([0, String(3e18)], this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.revertedWith("Must supply all tokens in pool");
    });

    it("Succeeds with expected output amount of pool tokens", async function () {
      const calculatedPoolTokenAmount = await this.swapFlashLoan
        .connect(this.user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true);

      const calculatedPoolTokenAmountWithSlippage = calculatedPoolTokenAmount.mul(999).div(1000);

      await this.swapFlashLoan
        .connect(this.user1)
        .addLiquidity([String(1e18), String(3e18)], calculatedPoolTokenAmountWithSlippage, this.MAX_UINT256);

      const actualPoolTokenAmount = await this.swapToken.balanceOf(this.user1.address);

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from("3992573549245912340"));
    });

    it("Succeeds with actual pool token amount being within ±0.1% range of calculated pool token", async function () {
      const calculatedPoolTokenAmount = await this.swapFlashLoan
        .connect(this.user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true);

      const calculatedPoolTokenAmountWithNegativeSlippage = calculatedPoolTokenAmount.mul(999).div(1000);

      const calculatedPoolTokenAmountWithPositiveSlippage = calculatedPoolTokenAmount.mul(1001).div(1000);

      await this.swapFlashLoan
        .connect(this.user1)
        .addLiquidity([String(1e18), String(3e18)], calculatedPoolTokenAmountWithNegativeSlippage, this.MAX_UINT256);

      const actualPoolTokenAmount = await this.swapToken.balanceOf(this.user1.address);

      expect(actualPoolTokenAmount).to.gte(calculatedPoolTokenAmountWithNegativeSlippage);

      expect(actualPoolTokenAmount).to.lte(calculatedPoolTokenAmountWithPositiveSlippage);
    });

    it("Succeeds with correctly updated tokenBalance after imbalanced deposit", async function () {
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256);

      // Check updated token balance
      expect(await this.swapFlashLoan.getTokenBalance(0)).to.eq(BigNumber.from(String(2e18)));
      expect(await this.swapFlashLoan.getTokenBalance(1)).to.eq(BigNumber.from(String(4e18)));
    });

    it("Reverts when minToMint is not reached due to front running", async function () {
      const calculatedLPTokenAmount = await this.swapFlashLoan
        .connect(this.user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true);

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount.mul(999).div(1000);

      // Someone else deposits thus front running user 1's deposit
      await this.swapFlashLoan.addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256);

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .addLiquidity([String(1e18), String(3e18)], calculatedLPTokenAmountWithSlippage, this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts when block is mined after deadline", async function () {
      const block = await ethers.provider.getBlock("latest");
      const currentTimestamp = block.timestamp;
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10]);

      await expect(
        this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Emits addLiquidity event", async function () {
      const calculatedLPTokenAmount = await this.swapFlashLoan
        .connect(this.user1)
        .calculateTokenAmount([String(2e18), String(1e16)], true);

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount.mul(999).div(1000);

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .addLiquidity([String(2e18), String(1e16)], calculatedLPTokenAmountWithSlippage, this.MAX_UINT256),
      ).to.emit(this.swapFlashLoan.connect(this.user1), "AddLiquidity");
    });
  });

  describe("removeLiquidity", () => {
    it("Reverts with 'Cannot exceed total supply'", async function () {
      await expect(this.swapFlashLoan.calculateRemoveLiquidity(this.MAX_UINT256)).to.be.revertedWith(
        "Cannot exceed total supply",
      );
    });

    it("Reverts with 'minAmounts must match poolTokens'", async function () {
      await expect(this.swapFlashLoan.removeLiquidity(String(2e18), [0], this.MAX_UINT256)).to.be.revertedWith(
        "minAmounts must match poolTokens",
      );
    });

    it("Succeeds even when contract is paused", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // Owner pauses the contract
      await this.swapFlashLoan.pause();

      // Owner and user 1 try to remove liquidity
      this.swapToken.approve(this.swapFlashLoan.address, String(2e18));
      this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);

      await this.swapFlashLoan.removeLiquidity(String(2e18), [0, 0], this.MAX_UINT256);
      await this.swapFlashLoan.connect(this.user1).removeLiquidity(currentUser1Balance, [0, 0], this.MAX_UINT256);
      expect(await this.dai.balanceOf(this.swapFlashLoan.address)).to.eq(0);
      expect(await this.usdt.balanceOf(this.swapFlashLoan.address)).to.eq(0);
    });

    it("Succeeds with expected return amounts of underlying tokens", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);

      const [daiBalanceBefore, usdtBalanceBefore, poolTokenBalanceBefore] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
        this.swapToken,
      ]);

      expect(poolTokenBalanceBefore).to.eq(BigNumber.from("1997175304122185406"));

      const [expectedDaiAmount, expectedUsdtAmount] = await this.swapFlashLoan.calculateRemoveLiquidity(
        poolTokenBalanceBefore,
      );

      expect(expectedDaiAmount).to.eq(BigNumber.from("1498939990494699510"));
      expect(expectedUsdtAmount).to.eq(BigNumber.from("504643130133215501"));

      // User 1 removes liquidity
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, poolTokenBalanceBefore);
      await this.swapFlashLoan
        .connect(this.user1)
        .removeLiquidity(poolTokenBalanceBefore, [expectedDaiAmount, expectedUsdtAmount], this.MAX_UINT256);

      const [daiBalanceAfter, usdtBalanceAfter] = await getUserTokenBalances(this.user1, [this.dai, this.usdt]);

      // Check the actual returned token amounts match the expected amounts
      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.eq(expectedDaiAmount);
      expect(usdtBalanceAfter.sub(usdtBalanceBefore)).to.eq(expectedUsdtAmount);
    });

    it("Reverts when user tries to burn more LP tokens than they own", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidity(currentUser1Balance.add(1), [this.MAX_UINT256, this.MAX_UINT256], this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      const [expectedDaiAmount, expectedUsdtAmount] = await this.swapFlashLoan.calculateRemoveLiquidity(
        currentUser1Balance,
      );

      expect(expectedDaiAmount).to.eq(BigNumber.from("1498939990494699510"));
      expect(expectedUsdtAmount).to.eq(BigNumber.from("504643130133215501"));

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await this.swapFlashLoan.connect(this.user2).addLiquidity([String(1e16), String(2e18)], 0, this.MAX_UINT256);

      // User 1 tries to remove liquidity which get reverted due to front running
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidity(currentUser1Balance, [expectedDaiAmount, expectedUsdtAmount], this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts when block is mined after deadline", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);

      const block = await ethers.provider.getBlock("latest");
      const currentTimestamp = block.timestamp;
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10]);

      // User 1 tries removing liquidity with deadline of +5 minutes
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan.connect(this.user1).removeLiquidity(currentUser1Balance, [0, 0], currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Emits removeLiquidity event", async function () {
      const block = await ethers.provider.getBlock("latest");
      const currentTimestamp = block.timestamp;
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10]);

      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);

      // User 1 tries removes liquidity
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan.connect(this.user1).removeLiquidity(currentUser1Balance, [0, 0], this.MAX_UINT256),
      ).to.emit(this.swapFlashLoan.connect(this.user1), "RemoveLiquidity");
    });
  });

  describe("removeLiquidityImbalance", () => {
    it("Reverts when contract is paused", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // Owner pauses the contract
      await this.swapFlashLoan.pause();

      // Owner and user 1 try to initiate imbalanced liquidity withdrawal
      this.swapToken.approve(this.swapFlashLoan.address, this.MAX_UINT256);
      this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, this.MAX_UINT256);

      await expect(
        this.swapFlashLoan.removeLiquidityImbalance([String(1e18), String(1e16)], this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.reverted;

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityImbalance([String(1e18), String(1e16)], this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts with 'Amounts should match pool tokens'", async function () {
      await expect(
        this.swapFlashLoan.removeLiquidityImbalance([String(1e18)], this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.revertedWith("Amounts should match pool tokens");
    });

    it("Reverts with 'Cannot withdraw more than available'", async function () {
      await expect(
        this.swapFlashLoan.removeLiquidityImbalance([this.MAX_UINT256, this.MAX_UINT256], 1, this.MAX_UINT256),
      ).to.be.revertedWith("Cannot withdraw more than available");
    });

    it("Succeeds with calculated max amount of pool token to be burned (±0.1%)", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await this.swapFlashLoan.calculateTokenAmount(
        [String(1e18), String(1e16)],
        false,
      );

      // ±0.1% range of pool token to be burned
      const maxPoolTokenAmountToBeBurnedNegativeSlippage = maxPoolTokenAmountToBeBurned.mul(1001).div(1000);
      const maxPoolTokenAmountToBeBurnedPositiveSlippage = maxPoolTokenAmountToBeBurned.mul(999).div(1000);

      const [daiBalanceBefore, usdtBalanceBefore, poolTokenBalanceBefore] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
        this.swapToken,
      ]);

      // User 1 withdraws imbalanced tokens
      await this.swapToken
        .connect(this.user1)
        .approve(this.swapFlashLoan.address, maxPoolTokenAmountToBeBurnedNegativeSlippage);
      await this.swapFlashLoan
        .connect(this.user1)
        .removeLiquidityImbalance(
          [String(1e18), String(1e16)],
          maxPoolTokenAmountToBeBurnedNegativeSlippage,
          this.MAX_UINT256,
        );

      const [daiBalanceAfter, usdtBalanceAfter, poolTokenBalanceAfter] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
        this.swapToken,
      ]);

      // Check the actual returned token amounts match the requested amounts
      expect(daiBalanceAfter.sub(daiBalanceBefore)).to.eq(String(1e18));
      expect(usdtBalanceAfter.sub(usdtBalanceBefore)).to.eq(String(1e16));

      // Check the actual burned pool token amount
      const actualPoolTokenBurned = poolTokenBalanceBefore.sub(poolTokenBalanceAfter);

      expect(actualPoolTokenBurned).to.eq(String("1000938036258454494"));
      expect(actualPoolTokenBurned).to.gte(maxPoolTokenAmountToBeBurnedPositiveSlippage);
      expect(actualPoolTokenBurned).to.lte(maxPoolTokenAmountToBeBurnedNegativeSlippage);
    });

    it("Returns correct amount of burned lpToken", async function () {
      await this.testSwapReturnValues.test_addLiquidity([String(1e18), String(2e18)], 0);

      const tokenBalance = await this.swapToken.balanceOf(this.testSwapReturnValues.address);
      await this.testSwapReturnValues.test_removeLiquidityImbalance([String(1e18), String(1e17)], tokenBalance);
    });

    it("Reverts when user tries to burn more LP tokens than they own", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityImbalance([String(1e18), String(1e16)], currentUser1Balance.add(1), this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await this.swapFlashLoan.calculateTokenAmount(
        [String(1e18), String(1e16)],
        false,
      );

      // Calculate +0.1% of pool token to be burned
      const maxPoolTokenAmountToBeBurnedNegativeSlippage = maxPoolTokenAmountToBeBurned.mul(1001).div(1000);

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await this.swapFlashLoan.connect(this.user2).addLiquidity([String(1e16), String(1e20)], 0, this.MAX_UINT256);

      // User 1 tries to remove liquidity which get reverted due to front running
      await this.swapToken
        .connect(this.user1)
        .approve(this.swapFlashLoan.address, maxPoolTokenAmountToBeBurnedNegativeSlippage);
      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            maxPoolTokenAmountToBeBurnedNegativeSlippage,
            this.MAX_UINT256,
          ),
      ).to.be.reverted;
    });

    it("Reverts when block is mined after deadline", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);

      const block = await ethers.provider.getBlock("latest");
      const currentTimestamp = block.timestamp;
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10]);

      // User 1 tries removing liquidity with deadline of +5 minutes
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityImbalance([String(1e18), String(1e16)], currentUser1Balance, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Emits RemoveLiquidityImbalance event", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);

      // User 1 removes liquidity
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, this.MAX_UINT256);

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityImbalance([String(1e18), String(1e16)], currentUser1Balance, this.MAX_UINT256),
      ).to.emit(this.swapFlashLoan.connect(this.user1), "RemoveLiquidityImbalance");
    });
  });

  describe("removeLiquidityOneToken", () => {
    it("Reverts when contract is paused.", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // Owner pauses the contract
      await this.swapFlashLoan.pause();

      // Owner and user 1 try to remove liquidity via single token
      this.swapToken.approve(this.swapFlashLoan.address, String(2e18));
      this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);

      await expect(this.swapFlashLoan.removeLiquidityOneToken(String(2e18), 0, 0, this.MAX_UINT256)).to.be.reverted;
      await expect(
        this.swapFlashLoan.connect(this.user1).removeLiquidityOneToken(currentUser1Balance, 0, 0, this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts with 'Token index out of range'", async function () {
      await expect(this.swapFlashLoan.calculateRemoveLiquidityOneToken(1, 5)).to.be.revertedWith(
        "Token index out of range",
      );
    });

    it("Reverts with 'Withdraw exceeds available'", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      await expect(
        this.swapFlashLoan.calculateRemoveLiquidityOneToken(currentUser1Balance.mul(2), 0),
      ).to.be.revertedWith("Withdraw exceeds available");
    });

    it("Reverts with 'Token not found'", async function () {
      await expect(
        this.swapFlashLoan.connect(this.user1).removeLiquidityOneToken(0, 9, 1, this.MAX_UINT256),
      ).to.be.revertedWith("Token not found");
    });

    it("Succeeds with calculated token amount as minAmount", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // User 1 calculates the amount of underlying token to receive.
      const daiAmount = await this.swapFlashLoan.calculateRemoveLiquidityOneToken(currentUser1Balance, 0);
      expect(daiAmount).to.eq(BigNumber.from("2009897239449463923"));

      // User 1 initiates one token withdrawal
      const before = await this.dai.balanceOf(this.user1.address);
      this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await this.swapFlashLoan
        .connect(this.user1)
        .removeLiquidityOneToken(currentUser1Balance, 0, daiAmount, this.MAX_UINT256);
      const after = await this.dai.balanceOf(this.user1.address);

      expect(after.sub(before)).to.eq(BigNumber.from("2009897239449463923"));
    });

    it("Returns correct amount of received token", async function () {
      await this.testSwapReturnValues.test_addLiquidity([String(1e18), String(2e18)], 0);
      await this.testSwapReturnValues.test_removeLiquidityOneToken(String(2e18), 0, 0);
    });

    it("Reverts when user tries to burn more LP tokens than they own", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityOneToken(currentUser1Balance.add(1), 0, 0, this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts when minAmount of underlying token is not reached due to front running", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);
      expect(currentUser1Balance).to.eq(BigNumber.from("1997175304122185406"));

      // User 1 calculates the amount of underlying token to receive.
      const daiAmount = await this.swapFlashLoan.calculateRemoveLiquidityOneToken(currentUser1Balance, 0);
      expect(daiAmount).to.eq(BigNumber.from("2009897239449463923"));

      // User 2 adds liquidity before User 1 initiates withdrawal
      await this.swapFlashLoan.connect(this.user2).addLiquidity([String(1e16), String(1e20)], 0, this.MAX_UINT256);

      // User 1 initiates one token withdrawal
      this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, daiAmount, this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Reverts when block is mined after deadline", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);

      const block = await ethers.provider.getBlock("latest");
      const currentTimestamp = block.timestamp;
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10]);

      // User 1 tries removing liquidity with deadline of +5 minutes
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan
          .connect(this.user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, 0, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Emits RemoveLiquidityOne event", async function () {
      // User 1 adds liquidity
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256);
      const currentUser1Balance = await this.swapToken.balanceOf(this.user1.address);

      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, currentUser1Balance);
      await expect(
        this.swapFlashLoan.connect(this.user1).removeLiquidityOneToken(currentUser1Balance, 0, 0, this.MAX_UINT256),
      ).to.emit(this.swapFlashLoan.connect(this.user1), "RemoveLiquidityOne");
    });
  });

  describe("swap", () => {
    it("Reverts when contract is paused", async function () {
      // Owner pauses the contract
      await this.swapFlashLoan.pause();

      // User 1 try to initiate swap
      await expect(this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e16), 0, this.MAX_UINT256)).to.be.reverted;
    });

    it("Reverts with 'Token index out of range'", async function () {
      await expect(this.swapFlashLoan.calculateSwap(0, 9, String(1e17))).to.be.revertedWith("Token index out of range");
    });

    it("Reverts with 'Cannot swap more than you own'", async function () {
      await expect(
        this.swapFlashLoan.connect(this.user1).swap(0, 1, this.MAX_UINT256, 0, this.MAX_UINT256),
      ).to.be.revertedWith("Cannot swap more than you own");
    });

    it("Succeeds with expected swap amounts", async function () {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await this.swapFlashLoan.calculateSwap(0, 1, String(1e17));
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99792433735144176"));

      const [tokenFromBalanceBefore, tokenToBalanceBefore] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
      ]);

      // User 1 successfully initiates swap
      await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), calculatedSwapReturn, this.MAX_UINT256);

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
      ]);
      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(BigNumber.from(String(1e17)));
      expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(calculatedSwapReturn);
    });

    it("Reverts when minDy (minimum amount token to receive) is not reached due to front running", async function () {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await this.swapFlashLoan.calculateSwap(0, 1, String(1e17));
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99792433735144176"));

      // User 2 swaps before User 1 does
      await this.swapFlashLoan.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256);

      // User 1 initiates swap
      await expect(
        this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), calculatedSwapReturn, this.MAX_UINT256),
      ).to.be.reverted;
    });

    it("Succeeds when using lower minDy even when transaction is front-ran", async function () {
      // User 1 calculates how much token to receive with 1% slippage
      const calculatedSwapReturn = await this.swapFlashLoan.calculateSwap(0, 1, String(1e17));
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99792433735144176"));

      const [tokenFromBalanceBefore, tokenToBalanceBefore] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
      ]);

      const calculatedSwapReturnWithNegativeSlippage = calculatedSwapReturn.mul(99).div(100);

      // User 2 swaps before User 1 does
      await this.swapFlashLoan.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256);

      // User 1 successfully initiates swap with 1% slippage from initial calculated amount
      await this.swapFlashLoan
        .connect(this.user1)
        .swap(0, 1, String(1e17), calculatedSwapReturnWithNegativeSlippage, this.MAX_UINT256);

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] = await getUserTokenBalances(this.user1, [
        this.dai,
        this.usdt,
      ]);

      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(BigNumber.from(String(1e17)));

      const actualReceivedAmount = tokenToBalanceAfter.sub(tokenToBalanceBefore);

      expect(actualReceivedAmount).to.eq(BigNumber.from("99375469399133611"));
      expect(actualReceivedAmount).to.gt(calculatedSwapReturnWithNegativeSlippage);
      expect(actualReceivedAmount).to.lt(calculatedSwapReturn);
    });

    it("Returns correct amount of received token", async function () {
      await this.testSwapReturnValues.test_addLiquidity([String(1e18), String(2e18)], 0);
      await this.testSwapReturnValues.test_swap(0, 1, String(1e18), 0);
    });

    it("Reverts when block is mined after deadline", async function () {
      const block = await ethers.provider.getBlock("latest");
      const currentTimestamp = block.timestamp;
      await ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10]);

      // User 1 tries swapping with deadline of +5 minutes
      await expect(
        this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Emits TokenSwap event", async function () {
      // User 1 initiates swap
      await expect(this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256)).to.emit(
        this.swapFlashLoan,
        "TokenSwap",
      );
    });
  });

  describe("getVirtualPrice", () => {
    it("Returns expected value after initial deposit", async function () {
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)));
    });

    it("Returns expected values after swaps", async function () {
      // With each swap, virtual price will increase due to the fees
      await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from("1000005000589050862"));

      await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from("1000010010486919300"));
    });

    it("Returns expected values after imbalanced withdrawal", async function () {
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);
      await this.swapFlashLoan.connect(this.user2).addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)));

      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, String(2e18));
      await this.swapFlashLoan
        .connect(this.user1)
        .removeLiquidityImbalance([String(1e18), 0], String(2e18), this.MAX_UINT256);

      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from("1000010008506795877"));

      await this.swapToken.connect(this.user2).approve(this.swapFlashLoan.address, String(2e18));
      await this.swapFlashLoan
        .connect(this.user2)
        .removeLiquidityImbalance([0, String(1e18)], String(2e18), this.MAX_UINT256);

      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from("1000020012788689080"));
    });

    it("Value is unchanged after balanced deposits", async function () {
      // pool is 1:1 ratio
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)));
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)));

      // pool changes to 2:1 ratio, thus changing the virtual price
      await this.swapFlashLoan.connect(this.user2).addLiquidity([String(2e18), String(0)], 0, this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from("1000016712123988753"));
      // User 2 makes balanced deposit, keeping the ratio 2:1
      await this.swapFlashLoan.connect(this.user2).addLiquidity([String(2e18), String(1e18)], 0, this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from("1000016712123988754"));
    });

    it("Value is unchanged after balanced withdrawals", async function () {
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, String(1e18));
      await this.swapFlashLoan.connect(this.user1).removeLiquidity(String(1e18), ["0", "0"], this.MAX_UINT256);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)));
    });
  });

  describe("setSwapFee", () => {
    it("Emits NewSwapFee event", async function () {
      await expect(this.swapFlashLoan.setSwapFee(BigNumber.from(1e8))).to.emit(this.swapFlashLoan, "NewSwapFee");
    });

    it("Reverts when called by non-owners", async function () {
      await expect(this.swapFlashLoan.connect(this.user1).setSwapFee(0)).to.be.reverted;
      await expect(this.swapFlashLoan.connect(this.user2).setSwapFee(BigNumber.from(1e8))).to.be.reverted;
    });

    it("Reverts when fee is higher than the limit", async function () {
      await expect(this.swapFlashLoan.setSwapFee(BigNumber.from(1e8).add(1))).to.be.reverted;
    });

    it("Succeeds when fee is within the limit", async function () {
      await this.swapFlashLoan.setSwapFee(BigNumber.from(1e8));
      expect((await this.swapFlashLoan.swapStorage()).swapFee).to.eq(BigNumber.from(1e8));
    });
  });

  describe("setAdminFee", () => {
    it("Emits NewAdminFee event", async function () {
      await expect(this.swapFlashLoan.setAdminFee(BigNumber.from(1e10))).to.emit(this.swapFlashLoan, "NewAdminFee");
    });

    it("Reverts when called by non-owners", async function () {
      await expect(this.swapFlashLoan.connect(this.user1).setSwapFee(0)).to.be.reverted;
      await expect(this.swapFlashLoan.connect(this.user2).setSwapFee(BigNumber.from(1e10))).to.be.reverted;
    });

    it("Reverts when adminFee is higher than the limit", async function () {
      await expect(this.swapFlashLoan.setAdminFee(BigNumber.from(1e10).add(1))).to.be.reverted;
    });

    it("Succeeds when adminFee is within the limit", async function () {
      await this.swapFlashLoan.setAdminFee(BigNumber.from(1e10));
      expect((await this.swapFlashLoan.swapStorage()).adminFee).to.eq(BigNumber.from(1e10));
    });
  });

  describe("setFeeAddress", () => {
    it("Succeeds in changing the feeAddress", async function () {
      await this.swapFlashLoan.setFeeAddress(this.user2.address);
      expect(await this.swapFlashLoan.feeAddress()).to.eq(this.user2.address);
    });

    it("Emits NewFeeAddress event", async function () {
      await expect(this.swapFlashLoan.setFeeAddress(this.user2.address)).to.emit(this.swapFlashLoan, "NewFeeAddress");
    });

    it("Reverts when called by non-owners", async function () {
      await expect(this.swapFlashLoan.connect(this.user1).setFeeAddress(this.user2.address)).to.be.reverted;
      await expect(this.swapFlashLoan.connect(this.user2).setFeeAddress(this.user2.address)).to.be.reverted;
    });

    it("Reverts when setting zero address", async function () {
      await expect(this.swapFlashLoan.setFeeAddress(this.ZERO_ADDRESS)).to.be.reverted;
      await expect(this.swapFlashLoan.setFeeAddress()).to.be.reverted;
    });
  });

  describe("getAdminBalance", () => {
    it("Reverts with 'Token index out of range'", async function () {
      await expect(this.swapFlashLoan.getAdminBalance(3)).to.be.revertedWith("Token index out of range");
    });

    it("Is always 0 when adminFee is set to 0", async function () {
      expect(await this.swapFlashLoan.getAdminBalance(0)).to.eq(0);
      expect(await this.swapFlashLoan.getAdminBalance(1)).to.eq(0);

      await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);

      expect(await this.swapFlashLoan.getAdminBalance(0)).to.eq(0);
      expect(await this.swapFlashLoan.getAdminBalance(1)).to.eq(0);
    });

    it("Returns expected amounts after swaps when adminFee is higher than 0", async function () {
      // Sets adminFee to 1% of the swap fees
      await this.swapFlashLoan.setAdminFee(BigNumber.from(10 ** 8));
      await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);

      expect(await this.swapFlashLoan.getAdminBalance(0)).to.eq(0);
      expect(await this.swapFlashLoan.getAdminBalance(1)).to.eq(String(99802413976));

      // After the first swap, the pool becomes imbalanced; there are more 0th token than 1st token in the pool.
      // Therefore swapping from 1st -> 0th will result in more 0th token returned
      // Also results in higher fees collected on the second swap.

      await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);

      expect(await this.swapFlashLoan.getAdminBalance(0)).to.eq(String(100197564491));
      expect(await this.swapFlashLoan.getAdminBalance(1)).to.eq(String(99802413976));
    });
  });

  describe("withdrawAdminFees", () => {
    it("Reverts when called by non-fee-address", async function () {
      await this.swapFlashLoan.setFeeAddress(this.user2.address);

      await expect(this.swapFlashLoan.connect(this.user1).withdrawAdminFees()).to.be.reverted;
      await expect(this.swapFlashLoan.connect(this.owner).withdrawAdminFees()).to.be.reverted;
    });

    it("Succeeds when there are no fees withdrawn", async function () {
      // Sets feeAddress to user2
      await this.swapFlashLoan.setFeeAddress(this.user2.address);

      // Sets adminFee to 1% of the swap fees
      await this.swapFlashLoan.setAdminFee(BigNumber.from(10 ** 8));

      const [daiBefore, usdtBefore] = await getUserTokenBalances(this.owner, [this.dai, this.usdt]);

      await this.swapFlashLoan.connect(this.user2).withdrawAdminFees();

      const [daiAfter, usdtAfter] = await getUserTokenBalances(this.owner, [this.dai, this.usdt]);

      expect(daiBefore).to.eq(daiAfter);
      expect(usdtBefore).to.eq(usdtAfter);
    });

    it("Succeeds with expected amount of fees withdrawn", async function () {
      // Sets feeAddress to user2
      await this.swapFlashLoan.setFeeAddress(this.user2.address);

      // Sets adminFee to 1% of the swap fees
      await this.swapFlashLoan.setAdminFee(BigNumber.from(10 ** 8));
      await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
      await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);

      expect(await this.swapFlashLoan.getAdminBalance(0)).to.eq(String(100197564491));
      expect(await this.swapFlashLoan.getAdminBalance(1)).to.eq(String(99802413976));

      const [daiBefore, usdtBefore] = await getUserTokenBalances(this.user2, [this.dai, this.usdt]);

      await this.swapFlashLoan.connect(this.user2).withdrawAdminFees();

      const [daiAfter, usdtAfter] = await getUserTokenBalances(this.user2, [this.dai, this.usdt]);

      expect(daiAfter.sub(daiBefore)).to.eq(String(100197564491));
      expect(usdtAfter.sub(usdtBefore)).to.eq(String(99802413976));
    });

    it("Withdrawing admin fees has no impact on users' withdrawal", async function () {
      // Sets feeAddress to user2
      await this.swapFlashLoan.setFeeAddress(this.user2.address);

      // Sets adminFee to 1% of the swap fees
      await this.swapFlashLoan.setAdminFee(BigNumber.from(10 ** 8));
      await this.swapFlashLoan.connect(this.user1).addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);

      for (let i = 0; i < 10; i++) {
        await this.swapFlashLoan.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
        await this.swapFlashLoan.connect(this.user2).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
      }

      await this.swapFlashLoan.connect(this.user2).withdrawAdminFees();

      const [daiBefore, usdtBefore] = await getUserTokenBalances(this.user1, [this.dai, this.usdt]);

      const user1LPTokenBalance = await this.swapToken.balanceOf(this.user1.address);
      await this.swapToken.connect(this.user1).approve(this.swapFlashLoan.address, user1LPTokenBalance);
      await this.swapFlashLoan.connect(this.user1).removeLiquidity(user1LPTokenBalance, [0, 0], this.MAX_UINT256);

      const [daiAfter, usdtAfter] = await getUserTokenBalances(this.user1, [this.dai, this.usdt]);

      expect(daiAfter.sub(daiBefore)).to.eq(BigNumber.from("999563042682003762"));

      expect(usdtAfter.sub(usdtBefore)).to.eq(BigNumber.from("1000536011898397009"));
    });
  });

  describe("rampA", () => {
    beforeEach(async function () {
      await forceAdvanceOneBlock();
    });

    it("Emits RampA event", async function () {
      await expect(this.swapFlashLoan.rampA(100, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1)).to.emit(
        this.swapFlashLoan,
        "RampA",
      );
    });

    it("Succeeds to ramp upwards", async function () {
      // Create imbalanced pool to measure virtual price change
      // We expect virtual price to increase as A decreases
      await this.swapFlashLoan.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256);

      // call rampA(), changing A to 100 within a span of 14 days
      const endTimestamp = (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1;
      await this.swapFlashLoan.rampA(100, endTimestamp);

      // +0 seconds since ramp A
      expect(await this.swapFlashLoan.getA()).to.be.eq(50);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5000);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000016712123988753");

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000);
      expect(await this.swapFlashLoan.getA()).to.be.eq(54);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5413);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000107995162371698");

      // set timestamp to the end of ramp period
      await setTimestamp(endTimestamp);
      expect(await this.swapFlashLoan.getA()).to.be.eq(100);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(10000);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000620838643581600");
    });

    it("Succeeds to ramp downwards", async function () {
      // Create imbalanced pool to measure virtual price change
      // We expect virtual price to decrease as A decreases
      await this.swapFlashLoan.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256);

      // call rampA()
      const endTimestamp = (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1;
      await this.swapFlashLoan.rampA(25, endTimestamp);

      // +0 seconds since ramp A
      expect(await this.swapFlashLoan.getA()).to.be.eq(50);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5000);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000016712123988753");

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000);
      expect(await this.swapFlashLoan.getA()).to.be.eq(47);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(4794);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("999965443556825764");

      // set timestamp to the end of ramp period
      await setTimestamp(endTimestamp);
      expect(await this.swapFlashLoan.getA()).to.be.eq(25);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(2500);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("998849315829863360");
    });

    it("Reverts when non-owner calls it", async function () {
      await expect(
        this.swapFlashLoan.connect(this.user1).rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.reverted;
    });

    it("Reverts with 'Wait 1 day before starting ramp'", async function () {
      await this.swapFlashLoan.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1);
      await expect(
        this.swapFlashLoan.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("Wait 1 day before starting ramp");
    });

    it("Reverts with 'Insufficient ramp time'", async function () {
      await expect(
        this.swapFlashLoan.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS - 1),
      ).to.be.revertedWith("Insufficient ramp time");
    });

    it("Reverts with 'futureA_ must be > 0 and < MAX_A'", async function () {
      await expect(
        this.swapFlashLoan.rampA(0, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("futureA_ must be > 0 and < MAX_A");
    });

    it("Reverts with 'futureA_ is too small'", async function () {
      await expect(
        this.swapFlashLoan.rampA(24, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("futureA_ is too small");
    });

    it("Reverts with 'futureA_ is too large'", async function () {
      await expect(
        this.swapFlashLoan.rampA(101, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("futureA_ is too large");
    });
  });

  describe("stopRampA", () => {
    it("Emits StopRampA event", async function () {
      // call rampA()
      await this.swapFlashLoan.rampA(100, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100);

      // Stop ramp
      await expect(this.swapFlashLoan.stopRampA()).to.emit(this.swapFlashLoan, "StopRampA");
    });

    it("Stop ramp succeeds", async function () {
      // call rampA()
      const endTimestamp = (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100;
      await this.swapFlashLoan.rampA(100, endTimestamp);

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000);
      expect(await this.swapFlashLoan.getA()).to.be.eq(54);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5413);

      // Stop ramp
      await this.swapFlashLoan.stopRampA();
      expect(await this.swapFlashLoan.getA()).to.be.eq(54);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5413);

      // set timestamp to endTimestamp
      await setTimestamp(endTimestamp);

      // verify ramp has stopped
      expect(await this.swapFlashLoan.getA()).to.be.eq(54);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5413);
    });

    it("Reverts with 'Ramp is already stopped'", async function () {
      // call rampA()
      const endTimestamp = (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100;
      await this.swapFlashLoan.rampA(100, endTimestamp);

      // set timestamp to +10000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000);
      expect(await this.swapFlashLoan.getA()).to.be.eq(54);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5413);

      // Stop ramp
      await this.swapFlashLoan.stopRampA();
      expect(await this.swapFlashLoan.getA()).to.be.eq(54);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5413);

      // check call reverts when ramp is already stopped
      await expect(this.swapFlashLoan.stopRampA()).to.be.revertedWith("Ramp is already stopped");
    });
  });

  describe("Check for timestamp manipulations", () => {
    beforeEach(async function () {
      await forceAdvanceOneBlock();
    });

    it("Check for maximum differences in A and virtual price when A is increasing", async function () {
      // Create imbalanced pool to measure virtual price change
      // Sets the pool in 2:1 ratio where this.dai is significantly cheaper than this.usdt
      await this.swapFlashLoan.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256);

      // Initial A and virtual price
      expect(await this.swapFlashLoan.getA()).to.be.eq(50);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5000);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000016712123988753");

      // Start ramp
      await this.swapFlashLoan.rampA(100, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1);

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900);

      expect(await this.swapFlashLoan.getA()).to.be.eq(50);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5003);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000017428282641698");

      // Max increase of A between two blocks
      // 5003 / 5000
      // = 1.0006

      // Max increase of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
      // 1000167862696363286 / 1000167146429977312
      // = 1.00000071615
    });

    it("Check for maximum differences in A and virtual price when A is decreasing", async function () {
      // Create imbalanced pool to measure virtual price change
      // Sets the pool in 2:1 ratio where this.dai is significantly cheaper than this.usdt
      await this.swapFlashLoan.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256);

      // Initial A and virtual price
      expect(await this.swapFlashLoan.getA()).to.be.eq(50);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5000);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000016712123988753");

      // Start ramp
      await this.swapFlashLoan.rampA(25, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1);

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900);

      expect(await this.swapFlashLoan.getA()).to.be.eq(49);
      expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(4999);
      expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq("1000016473217833611");

      // Max decrease of A between two blocks
      // 4999 / 5000
      // = 0.9998

      // Max decrease of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
      // 1000166907487883089 / 1000167146429977312
      // = 0.99999976109
    });

    // Below tests try to verify the issues found in Curve Vulnerability Report are resolved.
    // https://medium.com/@peter_4205/curve-vulnerability-report-a1d7630140ec
    // The two cases we are most concerned are:
    //
    // 1. A is ramping up, and the pool is at imbalanced state.
    //
    // Attacker can 'resolve' the imbalance prior to the change of A. Then try to recreate the imbalance after A has
    // changed. Due to the price curve becoming more linear, recreating the imbalance will become a lot cheaper. Thus
    // benefiting the attacker.
    //
    // 2. A is ramping down, and the pool is at balanced state
    //
    // Attacker can create the imbalance in token balances prior to the change of A. Then try to resolve them
    // near 1:1 ratio. Since downward change of A will make the price curve less linear, resolving the token balances
    // to 1:1 ratio will be cheaper. Thus benefiting the attacker
    //
    // For visual representation of how price curves differ based on A, please refer to Figure 1 in the above
    // Curve Vulnerability Report.

    describe("Check for attacks while A is ramping upwards", () => {
      let initialAttackerBalances: BigNumber[] = [];
      let initialPoolBalances: BigNumber[] = [];
      let attacker: Signer;

      beforeEach(async function () {
        // This attack is achieved by creating imbalance in the first block then
        // trading in reverse direction in the second block.
        attacker = this.user1;

        initialAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

        expect(initialAttackerBalances[0]).to.be.eq(String(1e20));
        expect(initialAttackerBalances[1]).to.be.eq(String(1e20));

        // Start ramp upwards
        await this.swapFlashLoan.rampA(100, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1);
        expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5000);

        // Check current pool balances
        initialPoolBalances = [
          await this.swapFlashLoan.getTokenBalance(0),
          await this.swapFlashLoan.getTokenBalance(1),
        ];
        expect(initialPoolBalances[0]).to.be.eq(String(1e18));
        expect(initialPoolBalances[1]).to.be.eq(String(1e18));
      });

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of this.dai to this.usdt, causing massive imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 9.085e17 of this.usdt
            expect(usdtOutput).to.be.eq("909410293664412218");

            // Pool is imbalanced! Now trades from this.usdt -> this.dai may be profitable in small sizes
            // this.dai balance in the pool  : 2.00e18
            // this.usdt balance in the pool : 9.14e16
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("90589706335587782");

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900);

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5003);

            // Trade this.usdt to this.dai, taking advantage of the imbalance and change of A
            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("999678397362731746");

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            expect(finalAttackerBalances[0]).to.be.lt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(initialAttackerBalances[0].sub(finalAttackerBalances[0])).to.be.eq("321602637268254");
            expect(initialAttackerBalances[1].sub(finalAttackerBalances[1])).to.be.eq("0");
            // Attacker lost 2.785e15 this.dai (0.2785% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [];
            finalPoolBalances.push(await this.swapFlashLoan.getTokenBalance(0));
            finalPoolBalances.push(await this.swapFlashLoan.getTokenBalance(1));

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq("321602637268254");
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) gained 2.785e15 this.dai (0.2785% of this.dai balance)
            // The attack did not benefit the attacker.
          });

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 1e18 of this.dai to this.usdt, causing massive imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 9.085e17 of this.usdt
            expect(usdtOutput).to.be.eq("909410293664412218");

            // Pool is imbalanced! Now trades from this.usdt -> this.dai may be profitable in small sizes
            // this.dai balance in the pool  : 2.00e18
            // this.usdt balance in the pool : 9.14e16
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("90589706335587782");

            // Assume no transactions occur during 2 weeks
            await setTimestamp((await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS);

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(10000);

            // Trade this.usdt to this.dai, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("957849006859164622");

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            expect(finalAttackerBalances[0]).to.be.lt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(initialAttackerBalances[0].sub(finalAttackerBalances[0])).to.be.eq("42150993140835378");
            expect(initialAttackerBalances[1].sub(finalAttackerBalances[1])).to.be.eq("0");
            // Attacker lost 4.426e16 this.dai (4.426%)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq("42150993140835378");
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) gained 4.426e16 this.dai (4.426% of this.dai balance of the pool)
            // The attack did not benefit the attacker.
          });
        },
      );

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          beforeEach(async function () {
            // Set up pool to be imbalanced prior to the attack
            await this.swapFlashLoan
              .connect(this.user2)
              .addLiquidity([String(0), String(2e18)], 0, (await getCurrentBlockTimestamp()) + 60);

            // Check current pool balances
            initialPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];
            expect(initialPoolBalances[0]).to.be.eq(String(1e18));
            expect(initialPoolBalances[1]).to.be.eq(String(3e18));
          });

          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of this.dai to this.usdt, resolving imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 1.012e18 of this.usdt
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 this.usdt
            expect(usdtOutput).to.be.eq("1012844902638213499");

            // Pool is now almost balanced!
            // this.dai balance in the pool  : 2.000e18
            // this.usdt balance in the pool : 1.988e18
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("1987155097361786501");

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900);

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5003);

            // Trade this.usdt to this.dai, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the attacker leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("999808300832170259");

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            expect(finalAttackerBalances[0]).to.be.lt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(initialAttackerBalances[0].sub(finalAttackerBalances[0])).to.be.eq("191699167829741");
            expect(initialAttackerBalances[1].sub(finalAttackerBalances[1])).to.be.eq("0");
            // Attacker lost 1.982e15 this.dai (0.1982% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [];
            finalPoolBalances.push(await this.swapFlashLoan.getTokenBalance(0));
            finalPoolBalances.push(await this.swapFlashLoan.getTokenBalance(1));

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq("191699167829741");
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) gained 1.982e15 this.dai (0.1982% of this.dai balance)
            // The attack did not benefit the attacker.
          });

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 1e18 of this.dai to this.usdt, resolving the imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 9.085e17 of this.usdt
            expect(usdtOutput).to.be.eq("1012844902638213499");

            // Pool is now almost balanced!
            // this.dai balance in the pool  : 2.000e18
            // this.usdt balance in the pool : 1.988e18
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("1987155097361786501");

            // Assume 2 weeks go by without any other transactions
            // This mimics rapid change of A
            await setTimestamp((await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS);

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(10000);

            // Trade this.usdt to this.dai, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("1006104761668970935");
            // Attack was successful!

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            expect(initialAttackerBalances[0]).to.be.lt(finalAttackerBalances[0]);
            expect(initialAttackerBalances[1]).to.be.eq(finalAttackerBalances[1]);
            expect(finalAttackerBalances[0].sub(initialAttackerBalances[0])).to.be.eq("6104761668970935");
            expect(finalAttackerBalances[1].sub(initialAttackerBalances[1])).to.be.eq("0");
            // Attacker gained 4.430e15 this.dai (0.430%)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];

            expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq("6104761668970935");
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) lost 4.430e15 this.dai (0.430% of this.dai balance)

            // The attack benefited the attacker.
            // Note that this attack is only possible when there are no swaps happening during the 2 weeks ramp period.
          });
        },
      );
    });

    describe("Check for attacks while A is ramping downwards", () => {
      let initialAttackerBalances: BigNumber[] = [];
      let initialPoolBalances: BigNumber[] = [];
      let attacker: Signer;

      beforeEach(async function () {
        // Set up the downward ramp A
        attacker = this.user1;

        initialAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

        expect(initialAttackerBalances[0]).to.be.eq(String(1e20));
        expect(initialAttackerBalances[1]).to.be.eq(String(1e20));

        // Start ramp downwards
        await this.swapFlashLoan.rampA(25, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1);
        expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(5000);

        // Check current pool balances
        initialPoolBalances = [
          await this.swapFlashLoan.getTokenBalance(0),
          await this.swapFlashLoan.getTokenBalance(1),
        ];
        expect(initialPoolBalances[0]).to.be.eq(String(1e18));
        expect(initialPoolBalances[1]).to.be.eq(String(1e18));
      });

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          // This attack is achieved by creating imbalance in the first block then
          // trading in reverse direction in the second block.

          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of this.dai to this.usdt, causing massive imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 9.085e17 of this.usdt
            expect(usdtOutput).to.be.eq("909410293664412218");

            // Pool is imbalanced! Now trades from this.usdt -> this.dai may be profitable in small sizes
            // this.dai balance in the pool  : 2.00e18
            // this.usdt balance in the pool : 9.14e16
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("90589706335587782");

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900);

            // Verify A has changed downwards
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(4999);

            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("999740961446163163");

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(initialAttackerBalances[0].sub(finalAttackerBalances[0])).to.be.eq("259038553836837");
            expect(initialAttackerBalances[1].sub(finalAttackerBalances[1])).to.be.eq("0");
            // Attacker lost 2.723e15 this.dai (0.2723% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq("259038553836837");
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) gained 2.723e15 this.dai (0.2723% of this.dai balance)
            // The attack did not benefit the attacker.
          });

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test is to show how dangerous rapid A ramp is.

            // Swap 1e18 of this.dai to this.usdt, causing massive imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 9.085e17 of this.usdt
            expect(usdtOutput).to.be.eq("909410293664412218");

            // Pool is imbalanced! Now trades from this.usdt -> this.dai may be profitable in small sizes
            // this.dai balance in the pool  : 2.00e18
            // this.usdt balance in the pool : 9.14e16
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("90589706335587782");

            // Assume no transactions occur during 2 weeks ramp time
            await setTimestamp((await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS);

            // Verify A has changed downwards
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(2500);

            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("1069229183877335560");

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.gt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(finalAttackerBalances[0].sub(initialAttackerBalances[0])).to.be.eq("69229183877335560");
            expect(finalAttackerBalances[1].sub(initialAttackerBalances[1])).to.be.eq("0");
            // Attacker gained 6.625e16 this.dai (6.625% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];

            expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq("69229183877335560");
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) lost 6.625e16 this.dai (6.625% of this.dai balance)

            // The attack was successful. The change of A (-50%) gave the attacker a chance to swap
            // more efficiently. The swap fee (0.1%) was not sufficient to counter the efficient trade, giving
            // the attacker more tokens than initial deposit.
          });
        },
      );

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          beforeEach(async function () {
            // Set up pool to be imbalanced prior to the attack
            await this.swapFlashLoan
              .connect(this.user2)
              .addLiquidity([String(0), String(2e18)], 0, (await getCurrentBlockTimestamp()) + 60);

            // Check current pool balances
            initialPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];
            expect(initialPoolBalances[0]).to.be.eq(String(1e18));
            expect(initialPoolBalances[1]).to.be.eq(String(3e18));
          });

          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of this.dai to this.usdt, resolving imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 1.012e18 of this.usdt
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 this.usdt
            expect(usdtOutput).to.be.eq("1012844902638213499");

            // Pool is now almost balanced!
            // this.dai balance in the pool  : 2.000e18
            // this.usdt balance in the pool : 1.988e18
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("1987155097361786501");

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900);

            // Verify A has changed downwards
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(4999);

            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("999798469801411739");

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(initialAttackerBalances[0].sub(finalAttackerBalances[0])).to.be.eq("201530198588261");
            expect(initialAttackerBalances[1].sub(finalAttackerBalances[1])).to.be.eq("0");
            // Attacker lost 1.992e15 this.dai (0.1992% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq("201530198588261");
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) gained 1.992e15 this.dai (0.1992% of this.dai balance)
            // The attack did not benefit the attacker.
          });

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test case is to mimic rapid ramp down of A.

            // Swap 1e18 of this.dai to this.usdt, resolving imbalance in the pool
            await this.swapFlashLoan.connect(attacker).swap(0, 1, String(1e18), 0, this.MAX_UINT256);
            const usdtOutput = (await getUserTokenBalance(attacker, this.usdt)).sub(initialAttackerBalances[1]);

            // First trade results in 1.012e18 of this.usdt
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 this.usdt
            expect(usdtOutput).to.be.eq("1012844902638213499");

            // Pool is now almost balanced!
            // this.dai balance in the pool  : 2.000e18
            // this.usdt balance in the pool : 1.988e18
            expect(await this.swapFlashLoan.getTokenBalance(0)).to.be.eq(String(2e18));
            expect(await this.swapFlashLoan.getTokenBalance(1)).to.be.eq("1987155097361786501");

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp((await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS);

            // Verify A has changed downwards
            expect(await this.swapFlashLoan.getAPrecise()).to.be.eq(2500);

            const balanceBefore = await getUserTokenBalance(attacker, this.dai);
            await this.swapFlashLoan.connect(attacker).swap(1, 0, usdtOutput, 0, this.MAX_UINT256);
            const daiOutput = (await getUserTokenBalance(attacker, this.dai)).sub(balanceBefore);

            // If daiOutput > 1e18, the malicious user leaves with more this.dai than the start.
            expect(daiOutput).to.be.eq("988081709433314578");
            // Attack was not successful

            const finalAttackerBalances = await getUserTokenBalances(attacker, [this.dai, this.usdt]);

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(initialAttackerBalances[0]);
            expect(finalAttackerBalances[1]).to.be.eq(initialAttackerBalances[1]);
            expect(initialAttackerBalances[0].sub(finalAttackerBalances[0])).to.be.eq("11918290566685422");
            expect(initialAttackerBalances[1].sub(finalAttackerBalances[1])).to.be.eq("0");
            // Attacker lost 1.368e16 this.dai (1.368% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.swapFlashLoan.getTokenBalance(0),
              await this.swapFlashLoan.getTokenBalance(1),
            ];

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0]);
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1]);
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq("11918290566685422");
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq("0");
            // Pool (liquidity providers) gained 1.368e16 this.dai (1.368% of this.dai balance)
            // The attack did not benefit the attacker
          });
        },
      );
    });
  });
});
