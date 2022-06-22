import { BigNumber, Signer } from "ethers";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  TIME,
  setupMetaSwap,
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

describe("Meta-Swap Deposit Contract", async function () {
  // Test Values
  const INITIAL_A_VALUE = 50;
  const SWAP_FEE = 1e7;
  const LP_TOKEN_NAME = "Test LP Token Name";
  const LP_TOKEN_SYMBOL = "TESTLP";

  beforeEach(async function () {
    this.signers = await ethers.getSigners();
    this.owner = this.signers[0];
    this.user1 = this.signers[1];
    this.user2 = this.signers[2];

    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    await setupMetaSwap(this, this.owner);

    // Initialize meta swap pool
    // Manually overload the signature
    await this.metaSwap.initializeMetaSwap(
      [this.ust.address, this.swapLPToken.address],
      [18, 18],
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      0,
      this.lpTokenBase.address,
      this.swapFlashLoan.address,
    );
    const metaSwapStorage = await this.metaSwap.swapStorage();
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.metaSwapLPToken = LpTokenFactory.attach(metaSwapStorage.lpToken);

    // Add liquidity to the meta swap pool
    await this.metaSwap.addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);

    expect(await this.ust.balanceOf(this.metaSwap.address)).to.eq(String(1e18));
    expect(await this.swapLPToken.balanceOf(this.metaSwap.address)).to.eq(String(1e18));

    const MetaSwapDepositFactory = await ethers.getContractFactory("MetaSwapDeposit", this.owner);
    this.metaSwapDeposit = await MetaSwapDepositFactory.deploy();

    // Initialize MetaSwapDeposit
    await this.metaSwapDeposit.initialize(
      this.swapFlashLoan.address,
      this.metaSwap.address,
      this.metaSwapLPToken.address,
    );
    this.allTokens = [this.ust, this.dai, this.usdt];

    // Approve token transfers to MetaSwapDeposit
    await asyncForEach([this.owner, this.user1, this.user2], async signer => {
      await asyncForEach([this.ust, this.dai, this.usdt, this.metaSwapLPToken], async token => {
        await token.connect(signer).approve(this.metaSwapDeposit.address, this.MAX_UINT256);
      });
    });
  });

  describe("getToken", () => {
    it("Returns correct token addresses", async function () {
      expect(await this.metaSwapDeposit.getToken(0)).to.be.eq(this.ust.address);
      expect(await this.metaSwapDeposit.getToken(1)).to.be.eq(this.dai.address);
      expect(await this.metaSwapDeposit.getToken(2)).to.be.eq(this.usdt.address);
    });

    it("Reverts if out of range", async function () {
      await expect(this.metaSwapDeposit.getToken(20)).to.be.revertedWith("out of range");
    });
  });

  describe("swap", () => {
    it("From 18 decimal token (meta) to 18 decimal token (base)", async function () {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await this.metaSwapDeposit.calculateSwap(0, 1, String(1e17));
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99697464001604409"));

      const [tokenFromBalanceBefore, tokenToBalanceBefore] = await getUserTokenBalances(this.user1, [
        this.ust,
        this.dai,
      ]);

      // User 1 successfully initiates swap
      await this.metaSwapDeposit.connect(this.user1).swap(0, 1, String(1e17), calculatedSwapReturn, this.MAX_UINT256);

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] = await getUserTokenBalances(this.user1, [this.ust, this.dai]);
      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(BigNumber.from(String(1e17)));
      expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(calculatedSwapReturn);
    });
  });

  describe("addLiquidity", () => {
    it("Reverts when deadline is not met", async function () {
      const tokenDepositAmounts = [String(3e18), String(1e18), String(1e18)];
      const blockTimestamp = await getCurrentBlockTimestamp();
      await expect(this.metaSwapDeposit.addLiquidity(tokenDepositAmounts, 0, blockTimestamp - 100)).to.be.revertedWith(
        "Deadline not met",
      );
    });

    it("Reverts when minToMint is not met", async function () {
      const tokenDepositAmounts = [String(3e18), String(1e18), String(1e18)];
      await expect(
        this.metaSwapDeposit.addLiquidity(tokenDepositAmounts, this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.revertedWith("Couldn't mint min requested");
    });

    it("Succeeds when depositing balanced amounts", async function () {
      // In this example, the MetaSwap pool has the two following tokens
      // [this.ust, usdLPToken]
      // MetaSwapDeposit flattens the tokens so that users can add/remove liquidity easier
      // [this.ust, this.dai, this.usdt]
      const tokenDepositAmounts = [String(3e18), String(1e18), String(1e18)];
      const minToMint = await this.metaSwapDeposit.calculateTokenAmount(tokenDepositAmounts, true);
      expect(minToMint).to.eq(String("4998571128215503405"));

      const balanceBefore = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);
      await this.metaSwapDeposit.addLiquidity(tokenDepositAmounts, minToMint.mul(999).div(1000), this.MAX_UINT256);
      const balanceAfter = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);

      expect(balanceAfter.sub(balanceBefore)).to.eq(String("4998071024102008384"));
    });

    it("Succeeds when depositing imbalanced amounts", async function () {
      const tokenDepositAmounts = [String(1e18), String(1e18), String(0)];
      const minToMint = await this.metaSwapDeposit.calculateTokenAmount(tokenDepositAmounts, true);
      expect(minToMint).to.eq(String("1999983687274022023"));

      const balanceBefore = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);
      const returnValue = await this.metaSwapDeposit.callStatic.addLiquidity(
        tokenDepositAmounts,
        minToMint.mul(999).div(1000),
        this.MAX_UINT256,
      );
      await this.metaSwapDeposit.addLiquidity(tokenDepositAmounts, minToMint.mul(999).div(1000), this.MAX_UINT256);
      const balanceAfter = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);

      // Due to inaccurate fee calculations on imbalanced deposits/withdraws, there is some slippage
      // 2999247304956561646 / 2999946184458068855 = 0.99976703598 (-0.024% of expected)
      expect(balanceAfter.sub(balanceBefore)).to.eq(String("1999933654106202323"));
      expect(returnValue).to.eq("1999933654106202323");
    });

    it("Succeeds when depositing single token (meta swap level)", async function () {
      const tokenDepositAmounts = [String(1e18), String(0), String(0)];
      const minToMint = await this.metaSwapDeposit.calculateTokenAmount(tokenDepositAmounts, true);
      expect(minToMint).to.eq(String("996336848939039532"));

      const balanceBefore = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);
      await this.metaSwapDeposit.addLiquidity(tokenDepositAmounts, minToMint.mul(999).div(1000), this.MAX_UINT256);
      const balanceAfter = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);

      // Due to inaccurate fee calculations on imbalanced deposits/withdraws, there is some slippage
      // 999451222979682477 / 999951223098644936 = 0.99949997549 (-0.05% of expected)
      expect(balanceAfter.sub(balanceBefore)).to.eq(String("995836105629186479"));
    });

    it("Succeeds when depositing single token (base swap level)", async function () {
      const tokenDepositAmounts = [String(0), String(1e18), String(0)];
      const minToMint = await this.metaSwapDeposit.calculateTokenAmount(tokenDepositAmounts, true);
      expect(minToMint).to.eq(String("996320645441268214"));

      const balanceBefore = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);
      await this.metaSwapDeposit.addLiquidity(tokenDepositAmounts, minToMint.mul(999).div(1000), this.MAX_UINT256);
      const balanceAfter = await getUserTokenBalance(this.owner.address, this.metaSwapLPToken);

      // Due to inaccurate fee calculations on imbalanced deposits/withdraws, there is some slippage
      // 999452 / 1000000 = 0.999402 (-0.06% of expected)
      expect(balanceAfter.sub(balanceBefore)).to.eq(String("995770270207236088"));
    });
  });

  describe("removeLiquidity", () => {
    beforeEach(async function () {
      // Add more liquidity to test with
      await this.metaSwapDeposit.addLiquidity([String(3e18), String(1e18), String(0)], 0, this.MAX_UINT256);
    });

    it("Reverts when minAmounts are not reached", async function () {
      // meta swap level minAmounts not reached
      await expect(this.metaSwapDeposit.removeLiquidity(String(1e18), [String(6e18), 0, 0], this.MAX_UINT256)).to.be
        .reverted;
      // base swap level minAmounts not reached
      await expect(this.metaSwapDeposit.removeLiquidity(String(1e18), [0, String(6e18), 0], this.MAX_UINT256)).to.be
        .reverted;
    });

    it("Reverts when deadline is not met", async function () {
      const blockTimestamp = await getCurrentBlockTimestamp();
      await expect(
        this.metaSwapDeposit.removeLiquidity(String(1e18), [0, 0, 0], blockTimestamp - 100),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Reverts when minAmounts array length is too big", async function () {
      await expect(
        this.metaSwapDeposit.removeLiquidity(String(1e18), [0, 0, 0, 0, 0], this.MAX_UINT256),
      ).to.be.revertedWith("out of range");
    });

    it("Succeeds with expected minAmounts", async function () {
      const minAmounts = await this.metaSwapDeposit.calculateRemoveLiquidity(String(1e18));
      expect(minAmounts[0]).to.eq("667600726872341778");
      expect(minAmounts[1]).to.eq("167172361282026056");
      expect(minAmounts[2]).to.eq("166616971377434607");

      const balancesBefore = await getUserTokenBalances(this.owner.address, this.allTokens);
      const returnValues = await this.metaSwapDeposit.callStatic.removeLiquidity(
        String(1e18),
        minAmounts,
        this.MAX_UINT256,
      );
      await this.metaSwapDeposit.removeLiquidity(String(1e18), minAmounts, this.MAX_UINT256);
      const balancesAfter = await getUserTokenBalances(this.owner.address, this.allTokens);

      // Check the return value of the function matches the actual amounts that are withdrawn from the pool
      expect(balancesAfter[0].sub(balancesBefore[0])).to.eq("667600726872341778");
      expect(returnValues[0]).to.eq("667600726872341778");
      expect(balancesAfter[1].sub(balancesBefore[1])).to.eq("167172361282026056");
      expect(returnValues[1]).to.eq("167172361282026056");
      expect(balancesAfter[2].sub(balancesBefore[2])).to.eq("166616971377434607");
      expect(returnValues[2]).to.eq("166616971377434607");
    });
  });

  describe("removeLiquidityOneToken", () => {
    beforeEach(async function () {
      // Add more liquidity to test with
      await this.metaSwapDeposit.addLiquidity([String(3e18), String(1e18), String(0)], 0, this.MAX_UINT256);
    });

    it("Reverts when minAmount is not reached", async function () {
      await expect(
        this.metaSwapDeposit.removeLiquidityOneToken(String(1e18), 0, this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.revertedWith("dy < minAmount");
    });

    it("Reverts when deadline is not met", async function () {
      const blockTimestamp = await getCurrentBlockTimestamp();
      await expect(
        this.metaSwapDeposit.removeLiquidityOneToken(String(1e18), 0, 0, blockTimestamp - 100),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Reverts when index is out of range", async function () {
      await expect(
        this.metaSwapDeposit.removeLiquidityOneToken(String(1e18), 10, 0, this.MAX_UINT256),
      ).to.be.revertedWith("out of range");
    });

    it("Succeeds when withdrawing via a meta level token", async function () {
      const minAmount = await this.metaSwapDeposit.calculateRemoveLiquidityOneToken(String(1e18), 0);
      const returnValue = await this.metaSwapDeposit.callStatic.removeLiquidityOneToken(
        String(1e18),
        0,
        minAmount,
        this.MAX_UINT256,
      );

      const balanceBefore = await getUserTokenBalance(this.owner.address, this.ust);
      await this.metaSwapDeposit.removeLiquidityOneToken(String(1e18), 0, minAmount, this.MAX_UINT256);
      const balanceAfter = await getUserTokenBalance(this.owner.address, this.ust);

      // Check the return value matches the amount withdrawn
      expect(balanceAfter.sub(balanceBefore)).to.eq("1005137313324200028");
      expect(returnValue).to.eq("1005137313324200028");
    });

    it("Succeeds when withdrawing via a base level token", async function () {
      const minAmount = await this.metaSwapDeposit.calculateRemoveLiquidityOneToken(String(1e18), 2);
      const returnValue = await this.metaSwapDeposit.callStatic.removeLiquidityOneToken(
        String(1e18),
        2,
        minAmount,
        this.MAX_UINT256,
      );

      const balanceBefore = await getUserTokenBalance(this.owner.address, this.usdt);
      await this.metaSwapDeposit.removeLiquidityOneToken(String(1e18), 2, minAmount, this.MAX_UINT256);
      const balanceAfter = await getUserTokenBalance(this.owner.address, this.usdt);

      // Check the return value matches the amount withdrawn
      expect(balanceAfter.sub(balanceBefore)).to.eq("980349140764212719");
      expect(returnValue).to.eq("980349140764212719");
    });
  });

  describe("removeLiquidityImbalance", () => {
    beforeEach(async function () {
      // Add more liquidity to test with
      await this.metaSwapDeposit.addLiquidity([String(3e18), String(3e18), String(2e18)], 0, this.MAX_UINT256);
    });

    it("Reverts when maxBurnAmount is exceeded", async function () {
      const maxBurnAmount = 1;
      await expect(
        this.metaSwapDeposit.removeLiquidityImbalance(
          [String(1e18), String(1e18), String(0)],
          maxBurnAmount,
          this.MAX_UINT256,
        ),
      ).to.be.revertedWith("tokenAmount > maxBurnAmount");
    });

    it("Reverts when deadline is not met", async function () {
      const blockTimestamp = await getCurrentBlockTimestamp();
      await expect(
        this.metaSwapDeposit.removeLiquidityImbalance(
          [String(1e18), String(1e18), String(0)],
          String(2e18),
          blockTimestamp - 100,
        ),
      ).to.be.revertedWith("Deadline not met");
    });

    it("Reverts when amounts array length is too big", async function () {
      await expect(
        this.metaSwapDeposit.removeLiquidityImbalance(
          [String(1e18), String(1e18), String(0), String(0), String(0)],
          String(2e18),
          this.MAX_UINT256,
        ),
      ).to.be.revertedWith("out of range");
    });

    it("Reverts when slippage setting is 0%", async function () {
      // Due to the inaccuracy of swap fee calculation on imbalanced withdrawls, maxBurnAmount should always use a slippage
      // setting that is at least 0.1% when withdrawing meta-level tokens and 0.2% when withdrawing base-level tokens.
      const amounts = [String(1e18), String(0), String(0)];
      const maxBurnAmount = await this.metaSwapDeposit.calculateTokenAmount(amounts, false);
      await expect(
        this.metaSwapDeposit.removeLiquidityImbalance(amounts, maxBurnAmount, this.MAX_UINT256),
      ).to.be.revertedWith("tokenAmount > maxBurnAmount");
    });

    it("Succeeds when only withdrawing meta-level tokens", async function () {
      const amounts = [String(1e18), String(0), String(0)];

      // Apply 0.1% slippage
      const maxBurnAmount = (await this.metaSwapDeposit.calculateTokenAmount(amounts, false)).mul(1001).div(1000);
      expect(maxBurnAmount).to.eq("1007815278996202119");

      // Balances before the call
      const tokens = [this.ust, this.dai, this.usdt, this.metaSwapLPToken];
      const balancesBefore = await getUserTokenBalances(this.owner.address, tokens);

      // Perform the call
      const returnValues = await this.metaSwapDeposit.callStatic.removeLiquidityImbalance(
        amounts,
        maxBurnAmount,
        this.MAX_UINT256,
      );
      await this.metaSwapDeposit.removeLiquidityImbalance(amounts, maxBurnAmount, this.MAX_UINT256);

      // Balances after the call
      const balancesAfter = await getUserTokenBalances(this.owner.address, tokens);

      // The return value matches the amount of meta LP token burned
      expect(returnValues).to.eq("1007410020583259754");
      expect(balancesBefore[3].sub(balancesAfter[3])).to.eq("1007410020583259754");

      // Check user's balances increased in desired amounts
      expect(balancesAfter[0].sub(balancesBefore[0])).to.eq(amounts[0]);
      expect(balancesAfter[1].sub(balancesBefore[1])).to.eq(amounts[1]);
      expect(balancesAfter[2].sub(balancesBefore[2])).to.eq(amounts[2]);
    });

    it("Succeeds when only withdrawing base-level tokens", async function () {
      const amounts = [String(0), String(1e18), String(1e18)];

      // Apply 0.2% slippage
      const maxBurnAmount = (await this.metaSwapDeposit.calculateTokenAmount(amounts, false)).mul(1002).div(1000);
      expect(maxBurnAmount).to.eq("1999711808229957364");

      // Balances before the call
      const tokens = [this.ust, this.dai, this.usdt, this.metaSwapLPToken];
      const balancesBefore = await getUserTokenBalances(this.owner.address, tokens);

      // Perform the call
      const returnValues = await this.metaSwapDeposit.callStatic.removeLiquidityImbalance(
        amounts,
        maxBurnAmount,
        this.MAX_UINT256,
      );
      await this.metaSwapDeposit.removeLiquidityImbalance(amounts, maxBurnAmount, this.MAX_UINT256);

      // Balances after the call
      const balancesAfter = await getUserTokenBalances(this.owner.address, tokens);

      // The return value matches the amount of meta LP token burned
      expect(returnValues).to.eq("1996521784314825701");
      expect(balancesBefore[3].sub(balancesAfter[3])).to.eq("1996521784314825701");

      // Check the user's balances increased in desired amounts
      expect(balancesAfter[0].sub(balancesBefore[0])).to.eq(amounts[0]);
      expect(balancesAfter[1].sub(balancesBefore[1])).to.eq(amounts[1]);
      expect(balancesAfter[2].sub(balancesBefore[2])).to.eq(amounts[2]);
    });

    it("Succeeds when withdrawing both meta-level and base-level tokens", async function () {
      const amounts = [String(1e18), String(0), String(1e18)];

      // Apply 0.2% slippage
      const maxBurnAmount = (await this.metaSwapDeposit.calculateTokenAmount(amounts, false)).mul(1002).div(1000);
      expect(maxBurnAmount).to.eq("2004988643957319719");

      // Balances before the call
      const tokens = [this.ust, this.dai, this.usdt, this.metaSwapLPToken];
      const balancesBefore = await getUserTokenBalances(this.owner.address, tokens);

      // Perform the call
      const returnValues = await this.metaSwapDeposit.callStatic.removeLiquidityImbalance(
        amounts,
        maxBurnAmount,
        this.MAX_UINT256,
      );
      await this.metaSwapDeposit.removeLiquidityImbalance(amounts, maxBurnAmount, this.MAX_UINT256);

      // Balances after the call
      const balancesAfter = await getUserTokenBalances(this.owner.address, tokens);

      // The return value matches the amount of meta LP token burned
      expect(returnValues).to.eq("2001236779509847886");
      expect(balancesBefore[3].sub(balancesAfter[3])).to.eq("2001236779509847886");

      // Check the user's balances increased in desired amounts
      expect(balancesAfter[0].sub(balancesBefore[0])).to.eq(amounts[0]);
      expect(balancesAfter[1].sub(balancesBefore[1])).to.eq(amounts[1]);
      expect(balancesAfter[2].sub(balancesBefore[2])).to.eq(amounts[2]);
    });
  });
});
