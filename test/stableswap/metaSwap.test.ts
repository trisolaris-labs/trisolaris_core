import { BigNumber, Signer } from "ethers"
import { solidity } from "ethereum-waffle"
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
} from "../utils"

import chai from "chai"

chai.use(solidity)
const { expect } = chai

describe("Meta-Swap", async function () {
  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"

  

  beforeEach(async function () {
    this.signers = await ethers.getSigners()
    this.owner = this.signers[0]
    this.user1 = this.signers[1]
    this.user2 = this.signers[2]
        
    this.MAX_UINT256 = ethers.constants.MaxUint256
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
    await setupMetaSwap(this, this.owner)

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
    )
    const metaSwapStorage = await this.metaSwap.swapStorage()
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner)
    this.metaSwapLPToken = LpTokenFactory.attach(metaSwapStorage.lpToken)

    // Add liquidity to the meta swap pool
    await this.metaSwap.addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256)
    

    expect(await this.ust.balanceOf(this.metaSwap.address)).to.eq(String(1e18))
    expect(await this.swapLPToken.balanceOf(this.metaSwap.address)).to.eq(String(1e18))
  })

  describe("swapStorage", function () {
    describe("lpToken", async function () {
      it("Returns correct lpTokenName", async function () {
        expect(await this.metaSwapLPToken.name()).to.eq(LP_TOKEN_NAME)
      })

      it("Returns correct lpTokenSymbol", async function () {
        expect(await this.metaSwapLPToken.symbol()).to.eq(LP_TOKEN_SYMBOL)
      })
    })

    describe("A", async function () {
      it("Returns correct A value", async function () {
        expect(await this.metaSwap.getA()).to.eq(INITIAL_A_VALUE)
        expect(await this.metaSwap.getAPrecise()).to.eq(INITIAL_A_VALUE * 100)
      })
    })

    describe("fee", async function () {
      it("Returns correct fee value", async function () {
        expect((await this.metaSwap.swapStorage()).swapFee).to.eq(SWAP_FEE)
      })
    })

    describe("adminFee", async function () {
      it("Returns correct adminFee value", async function () {
        expect((await this.metaSwap.swapStorage()).adminFee).to.eq(0)
      })
    })
  })
  
  describe("getToken", function () {
    it("Returns correct addresses of pooled tokens", async function () {
      expect(await this.metaSwap.getToken(0)).to.eq(this.ust.address)
      expect(await this.metaSwap.getToken(1)).to.eq(this.swapLPToken.address)
    })

    it("Reverts when index is out of range", async function () {
      await expect(this.metaSwap.getToken(2)).to.be.reverted
    })
  })

  describe("getTokenIndex", function () {
    it("Returns correct token indexes", async function () {
      expect(await this.metaSwap.getTokenIndex(this.ust.address)).to.be.eq(0)
      expect(await this.metaSwap.getTokenIndex(this.swapLPToken.address)).to.be.eq(1)
    })

    it("Reverts when token address is not found", async function () {
      await expect(this.metaSwap.getTokenIndex(this.ZERO_ADDRESS)).to.be.revertedWith(
        "Token does not exist",
      )
    })
  })

  describe("getTokenBalance", function () {
    it("Returns correct balances of pooled tokens", async function () {
      expect(await this.metaSwap.getTokenBalance(0)).to.eq(
        BigNumber.from(String(1e18)),
      )
      expect(await this.metaSwap.getTokenBalance(1)).to.eq(
        BigNumber.from(String(1e18)),
      )
    })

    it("Reverts when index is out of range", async function () {
      await expect(this.metaSwap.getTokenBalance(2)).to.be.reverted
    })
  })

  describe("getA", function () {
    it("Returns correct value", async function () {
      expect(await this.metaSwap.getA()).to.eq(INITIAL_A_VALUE)
    })
  })

  describe("addLiquidity", function () {
    it("Reverts when contract is paused", async function () {
      await this.metaSwap.pause()

      await expect(
        this.metaSwap
          .connect(this.user1)
          .addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256),
      ).to.be.reverted

      // unpause
      await this.metaSwap.unpause()
      
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256)

      const actualPoolTokenAmount = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(actualPoolTokenAmount).to.eq(BigNumber.from("3991672211258372957"))
    })

    it("Reverts with 'Amounts must match pooled tokens'", async function () {
      await expect(
        this.metaSwap.connect(this.user1).addLiquidity([String(1e16)], 0, this.MAX_UINT256),
      ).to.be.revertedWith("Amounts must match pooled tokens")
    })

    it("Reverts with 'Cannot withdraw more than available'", async function () {
      await expect(
        this.metaSwap
          .connect(this.user1)
          .calculateTokenAmount([this.MAX_UINT256, String(3e18)], false),
      ).to.be.revertedWith("Cannot withdraw more than available")
    })

    it("Reverts with 'Must supply all tokens in pool'", async function () {
      this.metaSwapLPToken.approve(this.metaSwap.address, String(2e18))
      await this.metaSwap.removeLiquidity(String(2e18), [0, 0], this.MAX_UINT256)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .addLiquidity([0, String(3e18)], this.MAX_UINT256, this.MAX_UINT256),
      ).to.be.revertedWith("Must supply all tokens in pool")
    })

    it("Succeeds with expected output amount of pool tokens", async function () {
      const calculatedPoolTokenAmount = await this.metaSwap
        .connect(this.user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      await this.metaSwap
        .connect(this.user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithSlippage,
          this.MAX_UINT256,
        )

      const actualPoolTokenAmount = await this.metaSwapLPToken.balanceOf(this.user1.address)

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from("3991672211258372957"))
    })

    it("Succeeds with actual pool token amount being within ±0.1% range of calculated pool token", async function () {
      const calculatedPoolTokenAmount = await this.metaSwap
        .connect(this.user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithNegativeSlippage =
        calculatedPoolTokenAmount.mul(999).div(1000)

      const calculatedPoolTokenAmountWithPositiveSlippage =
        calculatedPoolTokenAmount.mul(1001).div(1000)

      await this.metaSwap
        .connect(this.user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithNegativeSlippage,
          this.MAX_UINT256,
        )

      const actualPoolTokenAmount = await this.metaSwapLPToken.balanceOf(this.user1.address)

      expect(actualPoolTokenAmount).to.gte(
        calculatedPoolTokenAmountWithNegativeSlippage,
      )

      expect(actualPoolTokenAmount).to.lte(
        calculatedPoolTokenAmountWithPositiveSlippage,
      )
    })

    it("Succeeds with correctly updated tokenBalance after imbalanced deposit", async function () {
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256)

      // Check updated token balance
      expect(await this.metaSwap.getTokenBalance(0)).to.eq(
        BigNumber.from(String(2e18)),
      )
      expect(await this.metaSwap.getTokenBalance(1)).to.eq(
        BigNumber.from(String(4e18)),
      )
    })

    it("Returns correct minted lpToken amount", async function () {
      const mintedAmount = await this.metaSwap
        .connect(this.user1)
        .callStatic.addLiquidity([String(1e18), String(2e18)], 0, this.MAX_UINT256)

      expect(mintedAmount).to.eq("2997459774673651937")
    })

    it("Reverts when minToMint is not reached due to front running", async function () {
      const calculatedLPTokenAmount = await this.metaSwap
        .connect(this.user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      // Someone else deposits thus front running user 1's deposit
      await this.metaSwap.addLiquidity([String(1e18), String(3e18)], 0, this.MAX_UINT256)

      await expect(
        this.metaSwap
          .connect(this.user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            calculatedLPTokenAmountWithSlippage,
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async function () {
      const block = await ethers.provider.getBlock("latest")
      const currentTimestamp = block.timestamp
      ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10])

      await expect(
        this.metaSwap
          .connect(this.user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            0,
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits addLiquidity event", async function () {
      const calculatedLPTokenAmount = await this.metaSwap
        .connect(this.user1)
        .calculateTokenAmount([String(2e18), String(1e16)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      await expect(
        this.metaSwap
          .connect(this.user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            calculatedLPTokenAmountWithSlippage,
            this.MAX_UINT256,
          ),
      ).to.emit(this.metaSwap.connect(this.user1), "AddLiquidity")
    })
  })

  describe("removeLiquidity", function () {
    it("Reverts with 'Cannot exceed total supply'", async function () {
      await expect(
        this.metaSwap.calculateRemoveLiquidity(this.MAX_UINT256),
      ).to.be.revertedWith("Cannot exceed total supply")
    })

    it("Reverts with 'minAmounts must match poolTokens'", async function () {
      await expect(
        this.metaSwap.removeLiquidity(String(2e18), [0], this.MAX_UINT256),
      ).to.be.revertedWith("minAmounts must match poolTokens")
    })

    it("Succeeds even when contract is paused", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await this.metaSwap.pause()

      // Owner and user 1 try to remove liquidity
      this.metaSwapLPToken.approve(this.metaSwap.address, String(2e18))
      this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, currentUser1Balance)

      await this.metaSwap.removeLiquidity(String(2e18), [0, 0], this.MAX_UINT256)
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidity(currentUser1Balance, [0, 0], this.MAX_UINT256)
      expect(await this.ust.balanceOf(this.metaSwap.address)).to.eq(0)
      expect(await this.swapLPToken.balanceOf(this.metaSwap.address)).to.eq(0)
    })

    it("Succeeds with expected return amounts of underlying tokens", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)

      const [
        firstTokenBalanceBefore,
        secondTokenBalanceBefore,
        poolTokenBalanceBefore,
      ] = await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken, this.metaSwapLPToken])

      expect(poolTokenBalanceBefore).to.eq(
        BigNumber.from("1996275270169644725"),
      )

      const [expectedFirstTokenAmount, expectedSecondTokenAmount] =
        await this.metaSwap.calculateRemoveLiquidity(poolTokenBalanceBefore)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from("1498601924450190405"),
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from("504529314564897436"),
      )

      // User 1 removes liquidity
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, poolTokenBalanceBefore)
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidity(
          poolTokenBalanceBefore,
          [expectedFirstTokenAmount, expectedSecondTokenAmount],
          this.MAX_UINT256,
        )

      const [firstTokenBalanceAfter, secondTokenBalanceAfter] =
        await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken])

      // Check the actual returned token amounts match the expected amounts
      expect(firstTokenBalanceAfter.sub(firstTokenBalanceBefore)).to.eq(
        expectedFirstTokenAmount,
      )
      expect(secondTokenBalanceAfter.sub(secondTokenBalanceBefore)).to.eq(
        expectedSecondTokenAmount,
      )
    })

    it("Returns correct amounts of received tokens", async function () {
      const metaSwapLPTokenBalance = await this.metaSwapLPToken.balanceOf(this.owner.address)

      await this.metaSwapLPToken.approve(this.metaSwap.address, this.MAX_UINT256)
      const removedTokenAmounts = await this.metaSwap.callStatic.removeLiquidity(
        metaSwapLPTokenBalance,
        [0, 0],
        this.MAX_UINT256,
      )

      expect(removedTokenAmounts[0]).to.eq("1000000000000000000")
      expect(removedTokenAmounts[1]).to.eq("1000000000000000000")
    })

    it("Reverts when user tries to burn more LP tokens than they own", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidity(
            currentUser1Balance.add(1),
            [this.MAX_UINT256, this.MAX_UINT256],
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      const [expectedFirstTokenAmount, expectedSecondTokenAmount] =
        await this.metaSwap.calculateRemoveLiquidity(currentUser1Balance)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from("1498601924450190405"),
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from("504529314564897436"),
      )

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await this.metaSwap
        .connect(this.user2)
        .addLiquidity([String(1e16), String(2e18)], 0, this.MAX_UINT256)

      // User 1 tries to remove liquidity which get reverted due to front running
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidity(
            currentUser1Balance,
            [expectedFirstTokenAmount, expectedSecondTokenAmount],
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)

      const block = await ethers.provider.getBlock("latest")
      const currentTimestamp = block.timestamp
      ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10])

      // User 1 tries removing liquidity with deadline of +5 minutes
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidity(
            currentUser1Balance,
            [0, 0],
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits removeLiquidity event", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)

      // User 1 tries removes liquidity
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidity(currentUser1Balance, [0, 0], this.MAX_UINT256),
      ).to.emit(this.metaSwap.connect(this.user1), "RemoveLiquidity")
    })
  })
  describe("removeLiquidityImbalance", function () {
    it("Reverts when contract is paused", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await this.metaSwap.pause()

      // Owner and user 1 try to initiate imbalanced liquidity withdrawal
      this.metaSwapLPToken.approve(this.metaSwap.address, this.MAX_UINT256)
      this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, this.MAX_UINT256)

      await expect(
        this.metaSwap.removeLiquidityImbalance(
          [String(1e18), String(1e16)],
          this.MAX_UINT256,
          this.MAX_UINT256,
        ),
      ).to.be.reverted

      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            this.MAX_UINT256,
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts with 'Amounts should match pool tokens'", async function () {
      await expect(
        this.metaSwap.removeLiquidityImbalance(
          [String(1e18)],
          this.MAX_UINT256,
          this.MAX_UINT256,
        ),
      ).to.be.revertedWith("Amounts should match pool tokens")
    })

    it("Reverts with 'Cannot withdraw more than available'", async function () {
      await expect(
        this.metaSwap.removeLiquidityImbalance(
          [this.MAX_UINT256, this.MAX_UINT256],
          1,
          this.MAX_UINT256,
        ),
      ).to.be.revertedWith("Cannot withdraw more than available")
    })

    it("Succeeds with calculated max amount of pool token to be burned (±0.1%)", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await this.metaSwap.calculateTokenAmount(
        [String(1e18), String(1e16)],
        false,
      )

      // ±0.1% range of pool token to be burned
      const maxPoolTokenAmountToBeBurnedNegativeSlippage =
        maxPoolTokenAmountToBeBurned.mul(1001).div(1000)
      const maxPoolTokenAmountToBeBurnedPositiveSlippage =
        maxPoolTokenAmountToBeBurned.mul(999).div(1000)

      const [
        firstTokenBalanceBefore,
        secondTokenBalanceBefore,
        poolTokenBalanceBefore,
      ] = await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken, this.metaSwapLPToken])

      // User 1 withdraws imbalanced tokens
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, maxPoolTokenAmountToBeBurnedNegativeSlippage)
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidityImbalance(
          [String(1e18), String(1e16)],
          maxPoolTokenAmountToBeBurnedNegativeSlippage,
          this.MAX_UINT256,
        )

      const [
        firstTokenBalanceAfter,
        secondTokenBalanceAfter,
        poolTokenBalanceAfter,
      ] = await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken, this.metaSwapLPToken])

      // Check the actual returned token amounts match the requested amounts
      expect(firstTokenBalanceAfter.sub(firstTokenBalanceBefore)).to.eq(
        String(1e18),
      )
      expect(secondTokenBalanceAfter.sub(secondTokenBalanceBefore)).to.eq(
        String(1e16),
      )

      // Check the actual burned pool token amount
      const actualPoolTokenBurned = poolTokenBalanceBefore.sub(
        poolTokenBalanceAfter,
      )

      expect(actualPoolTokenBurned).to.eq(String("1000934178112841889"))
      expect(actualPoolTokenBurned).to.gte(
        maxPoolTokenAmountToBeBurnedPositiveSlippage,
      )
      expect(actualPoolTokenBurned).to.lte(
        maxPoolTokenAmountToBeBurnedNegativeSlippage,
      )
    })

    it("Returns correct amount of burned lpToken", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)

      // User 1 removes liquidity
      await this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, this.MAX_UINT256)

      const burnedLPTokenAmount = await this.metaSwap
        .connect(this.user1)
        .callStatic.removeLiquidityImbalance(
          [String(1e18), String(1e16)],
          currentUser1Balance,
          this.MAX_UINT256,
        )

      expect(burnedLPTokenAmount).eq("1000934178112841889")
    })

    it("Reverts when user tries to burn more LP tokens than they own", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance.add(1),
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await this.metaSwap.calculateTokenAmount(
        [String(1e18), String(1e16)],
        false,
      )

      // Calculate +0.1% of pool token to be burned
      const maxPoolTokenAmountToBeBurnedNegativeSlippage =
        maxPoolTokenAmountToBeBurned.mul(1001).div(1000)
      
      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await this.metaSwap
        .connect(this.user2)
        .addLiquidity([String(1e16), String(1e20)], 0, this.MAX_UINT256)

      // User 1 tries to remove liquidity which get reverted due to front running
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, maxPoolTokenAmountToBeBurnedNegativeSlippage)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            maxPoolTokenAmountToBeBurnedNegativeSlippage,
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      
      const block = await ethers.provider.getBlock("latest")
      const currentTimestamp = block.timestamp
      ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10])

      // User 1 tries removing liquidity with deadline of +5 minutes
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance,
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits RemoveLiquidityImbalance event", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)

      // User 1 removes liquidity
      await this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, this.MAX_UINT256)

      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance,
            this.MAX_UINT256,
          ),
      ).to.emit(this.metaSwap.connect(this.user1), "RemoveLiquidityImbalance")
    })
  })

  describe("removeLiquidityOneToken", function () {
    it("Reverts when contract is paused.", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await this.metaSwap.pause()

      // Owner and user 1 try to remove liquidity via single token
      this.metaSwapLPToken.approve(this.metaSwap.address, String(2e18))
      this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, currentUser1Balance)

      await expect(
        this.metaSwap.removeLiquidityOneToken(String(2e18), 0, 0, this.MAX_UINT256),
      ).to.be.reverted
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, 0, this.MAX_UINT256),
      ).to.be.reverted
    })

    it("Reverts with 'Token index out of range'", async function () {
      await expect(
        this.metaSwap.calculateRemoveLiquidityOneToken(1, 5),
      ).to.be.revertedWith("Token index out of range")
    })

    it("Reverts with 'Withdraw exceeds available'", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        this.metaSwap.calculateRemoveLiquidityOneToken(
          currentUser1Balance.mul(2),
          0,
        ),
      ).to.be.revertedWith("Withdraw exceeds available")
    })

    it("Reverts with 'Token not found'", async function () {
      await expect(
        this.metaSwap.connect(this.user1).removeLiquidityOneToken(0, 9, 1, this.MAX_UINT256),
      ).to.be.revertedWith("Token not found")
    })

    it("Succeeds with calculated token amount as minAmount", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount =
        await this.metaSwap.calculateRemoveLiquidityOneToken(currentUser1Balance, 0)
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from("2008990034631583696"),
      )

      // User 1 initiates one token withdrawal
      const before = await this.ust.balanceOf(this.user1.address)
      this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, currentUser1Balance)
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidityOneToken(
          currentUser1Balance,
          0,
          calculatedFirstTokenAmount,
          this.MAX_UINT256,
        )
      const after = await this.ust.balanceOf(this.user1.address)

      expect(after.sub(before)).to.eq(BigNumber.from("2008990034631583696"))
    })

    it("Returns correct amount of received token", async function () {
      await this.metaSwapLPToken.approve(this.metaSwap.address, this.MAX_UINT256)
      const removedTokenAmount =
        await this.metaSwap.callStatic.removeLiquidityOneToken(
          String(1e18),
          0,
          0,
          this.MAX_UINT256,
        )
      expect(removedTokenAmount).to.eq("954404308901884931")
    })

    it("Reverts when user tries to burn more LP tokens than they own", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityOneToken(
            currentUser1Balance.add(1),
            0,
            0,
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmount of underlying token is not reached due to front running", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount =
        await this.metaSwap.calculateRemoveLiquidityOneToken(currentUser1Balance, 0)
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from("2008990034631583696"),
      )

      // User 2 adds liquidity before User 1 initiates withdrawal
      await this.metaSwap
        .connect(this.user2)
        .addLiquidity([String(1e16), String(1e20)], 0, this.MAX_UINT256)

      // User 1 initiates one token withdrawal
      this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            0,
            calculatedFirstTokenAmount,
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)

      const block = await ethers.provider.getBlock("latest")
      const currentTimestamp = block.timestamp
      ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10])

      // User 1 tries removing liquidity with deadline of +5 minutes
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            0,
            0,
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits RemoveLiquidityOne event", async function () {
      // User 1 adds liquidity
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(2e18), String(1e16)], 0, this.MAX_UINT256)
      const currentUser1Balance = await this.metaSwapLPToken.balanceOf(this.user1.address)

      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, currentUser1Balance)
      await expect(
        this.metaSwap
          .connect(this.user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, 0, this.MAX_UINT256),
      ).to.emit(this.metaSwap.connect(this.user1), "RemoveLiquidityOne")
    })
  })

  describe("swap", function () {
    it("Reverts when contract is paused", async function () {
      // Owner pauses the contract
      await this.metaSwap.pause()

      // User 1 try to initiate swap
      await expect(
        this.metaSwap.connect(this.user1).swap(0, 1, String(1e16), 0, this.MAX_UINT256),
      ).to.be.reverted
    })

    it("Reverts with 'Token index out of range'", async function () {
      await expect(
        this.metaSwap.calculateSwap(0, 9, String(1e17)),
      ).to.be.revertedWith("Token index out of range")
    })

    it("Reverts with 'Cannot swap more than you own'", async function () {
      await expect(
        this.metaSwap.connect(this.user1).swap(0, 1, this.MAX_UINT256, 0, this.MAX_UINT256),
      ).to.be.revertedWith("Cannot swap more than you own")
    })

    it("Succeeds with expected swap amounts", async function () {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await this.metaSwap.calculateSwap(
        0,
        1,
        String(1e17),
      )
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken])

      // User 1 successfully initiates swap
      await this.metaSwap
        .connect(this.user1)
        .swap(0, 1, String(1e17), calculatedSwapReturn, this.MAX_UINT256)

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] =
        await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken])
      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17)),
      )
      expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
        calculatedSwapReturn,
      )
    })

    it("Reverts when minDy (minimum amount token to receive) is not reached due to front running", async function () {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await this.metaSwap.calculateSwap(
        0,
        1,
        String(1e17),
      )
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      // User 2 swaps before User 1 does
      await this.metaSwap.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256)

      // User 1 initiates swap
      await expect(
        this.metaSwap
          .connect(this.user1)
          .swap(0, 1, String(1e17), calculatedSwapReturn, this.MAX_UINT256),
      ).to.be.reverted
    })

    it("Succeeds when using lower minDy even when transaction is front-ran", async function () {
      // User 1 calculates how much token to receive with 1% slippage
      const calculatedSwapReturn = await this.metaSwap.calculateSwap(
        0,
        1,
        String(1e17),
      )
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken])

      const calculatedSwapReturnWithNegativeSlippage = calculatedSwapReturn
        .mul(99)
        .div(100)

      // User 2 swaps before User 1 does
      await this.metaSwap.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256)

      // User 1 successfully initiates swap with 1% slippage from initial calculated amount
      await this.metaSwap
        .connect(this.user1)
        .swap(
          0,
          1,
          String(1e17),
          calculatedSwapReturnWithNegativeSlippage,
          this.MAX_UINT256,
        )

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] =
        await getUserTokenBalances(this.user1, [this.ust, this.swapLPToken])

      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17)),
      )

      const actualReceivedAmount = tokenToBalanceAfter.sub(tokenToBalanceBefore)

      expect(actualReceivedAmount).to.eq(BigNumber.from("99286252365528551"))
      expect(actualReceivedAmount).to.gt(
        calculatedSwapReturnWithNegativeSlippage,
      )
      expect(actualReceivedAmount).to.lt(calculatedSwapReturn)
    })

    it("Returns correct amount of received token", async function () {
      const swapReturnAmount = await this.metaSwap.callStatic.swap(
        0,
        1,
        String(1e18),
        0,
        this.MAX_UINT256,
      )
      expect(swapReturnAmount).to.eq("908591742545002306")
    })

    it("Reverts when block is mined after deadline", async function () {
      const block = await ethers.provider.getBlock("latest")
      const currentTimestamp = block.timestamp
      ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10])

      // User 1 tries swapping with deadline of +5 minutes
      await expect(
        this.metaSwap
          .connect(this.user1)
          .swap(0, 1, String(1e17), 0, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits TokenSwap event", async function () {
      // User 1 initiates swap
      await expect(
        this.metaSwap.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256),
      ).to.emit(this.metaSwap, "TokenSwap")
    })
  })

  /*
  describe("swapUnderlying", function () {
    it("Reverts when contract is paused", async function () {
      // Owner pauses the contract
      await this.metaSwap.pause()

      // User 1 try to initiate swap
      await expect(
        this.metaSwap
          .connect(this.user1)
          .swapUnderlying(0, 1, String(1e16), 0, this.MAX_UINT256),
      ).to.be.reverted
    })

    it("Reverts with 'Token index out of range'", async function () {
      await expect(
        this.metaSwap.calculateSwapUnderlying(0, 9, String(1e17)),
      ).to.be.revertedWith("Token index out of range")

      await expect(
        this.metaSwap.swapUnderlying(0, 9, String(1e17), 0, this.MAX_UINT256),
      ).to.be.revertedWith("Token index out of range")
    })

    describe("Succeeds with expected swap amounts", function () {
      it("From 18 decimal token (meta) to 18 decimal token (base)", async function () {
        // User 1 calculates how much token to receive
        const calculatedSwapReturn = await this.metaSwap.calculateSwapUnderlying(
          0,
          1,
          String(1e17),
        )
        expect(calculatedSwapReturn).to.eq(BigNumber.from("99682616104034773"))

        const [tokenFromBalanceBefore, tokenToBalanceBefore] =
          await getUserTokenBalances(this.user1, [this.ust, this.dai])

        // User 1 successfully initiates swap
        await this.metaSwap
          .connect(this.user1)
          .swapUnderlying(0, 1, String(1e17), calculatedSwapReturn, this.MAX_UINT256)

        // Check the sent and received amounts are as expected
        const [tokenFromBalanceAfter, tokenToBalanceAfter] =
          await getUserTokenBalances(this.user1, [this.ust, this.dai])
        expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
          BigNumber.from(String(1e17)),
        )
        expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
          calculatedSwapReturn,
        )
      })

      it("From 6 decimal token (base) to 18 decimal token (meta)", async function () {
        // User 1 calculates how much token to receive
        const calculatedSwapReturn = await this.metaSwap.calculateSwapUnderlying(
          2,
          0,
          String(1e5),
        )
        // this estimation works way better, doesn't it?
        expect(calculatedSwapReturn).to.eq(BigNumber.from("99682656211218516"))

        // Calculating swapping from a base token to a meta level token
        // could be wrong by about half of the base pool swap fee, i.e. 0.02% in this example
        const minReturnWithNegativeSlippage = calculatedSwapReturn
          .mul(9998)
          .div(10000)

        const [tokenFromBalanceBefore, tokenToBalanceBefore] =
          await getUserTokenBalances(this.user1, [this.usdc, this.ust])

        // User 1 successfully initiates swap
        await this.metaSwap
          .connect(this.user1)
          .swapUnderlying(
            2,
            0,
            String(1e5),
            minReturnWithNegativeSlippage,
            this.MAX_UINT256,
          )

        // Check the sent and received amounts are as expected
        const [tokenFromBalanceAfter, tokenToBalanceAfter] =
          await getUserTokenBalances(this.user1, [this.usdc, this.ust])
        expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
          BigNumber.from(String(1e5)),
        )
        expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
          "99683651227847339",
        )
      })

      it("From 18 decimal token (meta) to 6 decimal token (base)", async function () {
        // User 1 calculates how much token to receive
        const calculatedSwapReturn = await this.metaSwap.calculateSwapUnderlying(
          0,
          2,
          String(1e17),
        )
        expect(calculatedSwapReturn).to.eq(BigNumber.from("99682"))

        const [tokenFromBalanceBefore, tokenToBalanceBefore] =
          await getUserTokenBalances(this.user1, [this.ust, this.usdc])

        // User 1 successfully initiates swap
        await this.metaSwap
          .connect(this.user1)
          .swapUnderlying(0, 2, String(1e17), calculatedSwapReturn, this.MAX_UINT256)

        // Check the sent and received amounts are as expected
        const [tokenFromBalanceAfter, tokenToBalanceAfter] =
          await getUserTokenBalances(this.user1, [this.ust, this.usdc])
        expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
          BigNumber.from(String(1e17)),
        )
        expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
          calculatedSwapReturn,
        )
      })

      it("From 18 decimal token (base) to 6 decimal token (base)", async function () {
        // User 1 calculates how much token to receive
        const calculatedSwapReturn = await this.metaSwap.calculateSwapUnderlying(
          1,
          3,
          String(1e17),
        )
        expect(calculatedSwapReturn).to.eq(BigNumber.from("99959"))

        const [tokenFromBalanceBefore, tokenToBalanceBefore] =
          await getUserTokenBalances(this.user1, [this.dai, this.usdt])

        // User 1 successfully initiates swap
        await this.metaSwap
          .connect(this.user1)
          .swapUnderlying(1, 3, String(1e17), calculatedSwapReturn, this.MAX_UINT256)

        // Check the sent and received amounts are as expected
        const [tokenFromBalanceAfter, tokenToBalanceAfter] =
          await getUserTokenBalances(this.user1, [this.dai, this.usdt])
        expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
          BigNumber.from(String(1e17)),
        )
        expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
          calculatedSwapReturn,
        )
      })
    })

    it("Reverts when minDy (minimum amount token to receive) is not reached due to front running", async function () {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await this.metaSwap.calculateSwapUnderlying(
        0,
        1,
        String(1e17),
      )
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99682616104034773"))

      // User 2 swaps before User 1 does
      await this.metaSwap
        .connect(this.user2)
        .swapUnderlying(0, 1, String(1e17), 0, this.MAX_UINT256)

      // User 1 initiates swap
      await expect(
        this.metaSwap
          .connect(this.user1)
          .swapUnderlying(
            0,
            1,
            String(1e17),
            calculatedSwapReturn,
            this.MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Succeeds when using lower minDy even when transaction is front-ran", async function () {
      // User 1 calculates how much token to receive with 1% slippage
      const calculatedSwapReturn = await this.metaSwap.calculateSwapUnderlying(
        0,
        1,
        String(1e17),
      )
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99682616104034773"))

      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(this.user1, [this.ust, this.dai])

      const calculatedSwapReturnWithNegativeSlippage = calculatedSwapReturn
        .mul(99)
        .div(100)

      // User 2 swaps before User 1 does
      await this.metaSwap.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256)

      // User 1 successfully initiates swap with 1% slippage from initial calculated amount
      await this.metaSwap
        .connect(this.user1)
        .swapUnderlying(
          0,
          1,
          String(1e17),
          calculatedSwapReturnWithNegativeSlippage,
          this.MAX_UINT256,
        )

      // Check the sent and received amounts are as expected
      const [tokenFromBalanceAfter, tokenToBalanceAfter] =
        await getUserTokenBalances(this.user1, [this.ust, this.dai])

      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17)),
      )

      const actualReceivedAmount = tokenToBalanceAfter.sub(tokenToBalanceBefore)

      expect(actualReceivedAmount).to.eq(BigNumber.from("99266340636749675"))
      expect(actualReceivedAmount).to.gt(
        calculatedSwapReturnWithNegativeSlippage,
      )
      expect(actualReceivedAmount).to.lt(calculatedSwapReturn)
    })

    it("Returns correct amount of received token", async function () {
      const swapReturnAmount = await this.metaSwap.callStatic.swapUnderlying(
        0,
        1,
        String(1e17),
        0,
        this.MAX_UINT256,
      )
      expect(swapReturnAmount).to.eq("99682616104034773")
    })

    it("Reverts when block is mined after deadline", async function () {
      const block = await ethers.provider.getBlock("latest")
      const currentTimestamp = block.timestamp
      ethers.provider.send("evm_setNextBlockTimestamp", [currentTimestamp + 60 * 10])

      // User 1 tries swapping with deadline of +5 minutes
      await expect(
        this.metaSwap
          .connect(this.user1)
          .swapUnderlying(0, 1, String(1e17), 0, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits TokenSwap event", async function () {
      // User 1 initiates swap
      await expect(
        this.metaSwap
          .connect(this.user1)
          .swapUnderlying(0, 1, String(1e17), 0, this.MAX_UINT256),
      ).to.emit(this.metaSwap, "TokenSwapUnderlying")
    })
  })

  describe("getVirtualPrice", function () {
    it("Returns expected value after initial deposit", async function () {
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from(String(1e18)),
      )
    })

    it("Returns expected values after swaps", async function () {
      // With each swap, virtual price will increase due to the fees
      await this.metaSwap.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from("1000050005862349911"),
      )

      await this.metaSwap.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from("1000100104768517937"),
      )
    })

    it("Returns expected values after imbalanced withdrawal", async function () {
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256)
      await this.metaSwap
        .connect(this.user2)
        .addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from(String(1e18)),
      )

      await this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, String(2e18))
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidityImbalance([String(1e18), 0], String(2e18), this.MAX_UINT256)

      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from("1000100094088440633"),
      )

      await this.metaSwapLPToken.connect(this.user2).approve(this.metaSwap.address, String(2e18))
      await this.metaSwap
        .connect(this.user2)
        .removeLiquidityImbalance([0, String(1e18)], String(2e18), this.MAX_UINT256)

      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from("1000200154928939884"),
      )
    })

    it("Value is unchanged after balanced deposits", async function () {
      // pool is 1:1 ratio
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from(String(1e18)),
      )
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from(String(1e18)),
      )

      // pool changes to 2:1 ratio, thus changing the virtual price
      await this.metaSwap
        .connect(this.user2)
        .addLiquidity([String(2e18), String(0)], 0, this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
      // User 2 makes balanced deposit, keeping the ratio 2:1
      await this.metaSwap
        .connect(this.user2)
        .addLiquidity([String(2e18), String(1e18)], 0, this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
    })

    it("Value is unchanged after balanced withdrawals", async function () {
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256)
      await this.metaSwapLPToken.connect(this.user1).approve(this.metaSwap.address, String(1e18))
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidity(String(1e18), ["0", "0"], this.MAX_UINT256)
      expect(await this.metaSwap.getVirtualPrice()).to.eq(
        BigNumber.from(String(1e18)),
      )
    })
  })

  describe("setSwapFee", function () {
    it("Emits NewSwapFee event", async function () {
      await expect(this.metaSwap.setSwapFee(BigNumber.from(1e8))).to.emit(
        this.metaSwap,
        "NewSwapFee",
      )
    })

    it("Reverts when called by non-owners", async function () {
      await expect(this.metaSwap.connect(this.user1).setSwapFee(0)).to.be.reverted
      await expect(this.metaSwap.connect(this.user2).setSwapFee(BigNumber.from(1e8))).to
        .be.reverted
    })

    it("Reverts when fee is higher than the limit", async function () {
      await expect(this.metaSwap.setSwapFee(BigNumber.from(1e8).add(1))).to.be
        .reverted
    })

    it("Succeeds when fee is within the limit", async function () {
      await this.metaSwap.setSwapFee(BigNumber.from(1e8))
      expect((await this.metaSwap.swapStorage()).swapFee).to.eq(BigNumber.from(1e8))
    })
  })

  describe("setAdminFee", function () {
    it("Emits NewAdminFee event", async function () {
      await expect(this.metaSwap.setAdminFee(BigNumber.from(1e10))).to.emit(
        this.metaSwap,
        "NewAdminFee",
      )
    })

    it("Reverts when called by non-owners", async function () {
      await expect(this.metaSwap.connect(this.user1).setSwapFee(0)).to.be.reverted
      await expect(this.metaSwap.connect(this.user2).setSwapFee(BigNumber.from(1e10))).to
        .be.reverted
    })

    it("Reverts when adminFee is higher than the limit", async function () {
      await expect(this.metaSwap.setAdminFee(BigNumber.from(1e10).add(1))).to.be
        .reverted
    })

    it("Succeeds when adminFee is within the limit", async function () {
      await this.metaSwap.setAdminFee(BigNumber.from(1e10))
      expect((await this.metaSwap.swapStorage()).adminFee).to.eq(
        BigNumber.from(1e10),
      )
    })
  })

  describe("getAdminBalance", function () {
    it("Reverts with 'Token index out of range'", async function () {
      await expect(this.metaSwap.getAdminBalance(3)).to.be.revertedWith(
        "Token index out of range",
      )
    })

    it("Is always 0 when adminFee is set to 0", async function () {
      expect(await this.metaSwap.getAdminBalance(0)).to.eq(0)
      expect(await this.metaSwap.getAdminBalance(1)).to.eq(0)

      await this.metaSwap.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256)

      expect(await this.metaSwap.getAdminBalance(0)).to.eq(0)
      expect(await this.metaSwap.getAdminBalance(1)).to.eq(0)
    })

    it("Returns expected amounts after swaps when adminFee is higher than 0", async function () {
      // Sets adminFee to 1% of the swap fees
      await this.metaSwap.setAdminFee(BigNumber.from(10 ** 8))
      await this.metaSwap.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256)

      expect(await this.metaSwap.getAdminBalance(0)).to.eq(0)
      expect(await this.metaSwap.getAdminBalance(1)).to.eq(String(998024139765))

      // After the first swap, the pool becomes imbalanced; there are more 0th token than 1st token in the pool.
      // Therefore swapping from 1st -> 0th will result in more 0th token returned
      // Also results in higher fees collected on the second swap.

      await this.metaSwap.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256)

      expect(await this.metaSwap.getAdminBalance(0)).to.eq(String(1001973776101))
      expect(await this.metaSwap.getAdminBalance(1)).to.eq(String(998024139765))
    })
  })

  describe("withdrawAdminFees", function () {
    it("Reverts when called by non-owners", async function () {
      await expect(this.metaSwap.connect(this.user1).withdrawAdminFees()).to.be.reverted
      await expect(this.metaSwap.connect(this.user2).withdrawAdminFees()).to.be.reverted
    })

    it("Succeeds when there are no fees withdrawn", async function () {
      // Sets adminFee to 1% of the swap fees
      await this.metaSwap.setAdminFee(BigNumber.from(10 ** 8))

      const [firstTokenBefore, secondTokenBefore] = await getUserTokenBalances(
        this.owner,
        [this.ust, this.swapLPToken],
      )

      await this.metaSwap.withdrawAdminFees()

      const [firstTokenAfter, secondTokenAfter] = await getUserTokenBalances(
        this.owner,
        [this.ust, this.swapLPToken],
      )

      expect(firstTokenBefore).to.eq(firstTokenAfter)
      expect(secondTokenBefore).to.eq(secondTokenAfter)
    })

    it("Succeeds with expected amount of fees withdrawn (swap)", async function () {
      // Sets adminFee to 1% of the swap fees
      await this.metaSwap.setAdminFee(BigNumber.from(10 ** 8))
      await this.metaSwap.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256)
      await this.metaSwap.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256)

      expect(await this.metaSwap.getAdminBalance(0)).to.eq(String(1001973776101))
      expect(await this.metaSwap.getAdminBalance(1)).to.eq(String(998024139765))

      const [firstTokenBefore, secondTokenBefore] = await getUserTokenBalances(
        this.owner,
        [this.ust, this.swapLPToken],
      )

      await this.metaSwap.withdrawAdminFees()

      const [firstTokenAfter, secondTokenAfter] = await getUserTokenBalances(
        this.owner,
        [this.ust, this.swapLPToken],
      )

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1001973776101))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(
        String(998024139765),
      )
    })

    it("Succeeds with expected amount of fees withdrawn (swapUnderlying)", async function () {
      // Sets adminFee to 1% of the swap fees
      await this.metaSwap.setAdminFee(BigNumber.from(10 ** 8))
      await this.metaSwap
        .connect(this.user1)
        .swapUnderlying(0, 1, String(1e17), 0, this.MAX_UINT256)
      await this.metaSwap
        .connect(this.user1)
        .swapUnderlying(1, 0, String(1e17), 0, this.MAX_UINT256)

      expect(await this.metaSwap.getAdminBalance(0)).to.eq(String(1001925384316))
      expect(await this.metaSwap.getAdminBalance(1)).to.eq(String(998024139765))

      const [firstTokenBefore, secondTokenBefore] = await getUserTokenBalances(
        this.owner,
        [this.ust, this.swapLPToken],
      )

      await this.metaSwap.withdrawAdminFees()

      const [firstTokenAfter, secondTokenAfter] = await getUserTokenBalances(
        this.owner,
        [this.ust, this.swapLPToken],
      )

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1001774294135))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(
        String(998024139765),
      )
    })

    it("Withdrawing admin fees has no impact on users' withdrawal", async function () {
      // Sets adminFee to 1% of the swap fees
      await this.metaSwap.setAdminFee(BigNumber.from(10 ** 8))
      await this.metaSwap
        .connect(this.user1)
        .addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256)

      for (let i = 0; i < 10; i++) {
        await this.metaSwap.connect(this.user2).swap(0, 1, String(1e17), 0, this.MAX_UINT256)
        await this.metaSwap.connect(this.user2).swap(1, 0, String(1e17), 0, this.MAX_UINT256)
      }

      await this.metaSwap.withdrawAdminFees()

      const [firstTokenBefore, secondTokenBefore] = await getUserTokenBalances(
        this.user1,
        [this.ust, this.swapLPToken],
      )

      const user1LPTokenBalance = await this.metaSwapLPToken.balanceOf(this.user1.address)
      await this.metaSwapLPToken
        .connect(this.user1)
        .approve(this.metaSwap.address, user1LPTokenBalance)
      await this.metaSwap
        .connect(this.user1)
        .removeLiquidity(user1LPTokenBalance, [0, 0], this.MAX_UINT256)

      const [firstTokenAfter, secondTokenAfter] = await getUserTokenBalances(
        this.user1,
        [this.ust, this.swapLPToken],
      )

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(
        BigNumber.from("1000009516257264879"),
      )

      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(
        BigNumber.from("1000980987206499309"),
      )
    })
  })
  */

  /*
  describe("rampA", function () {
    beforeEach(async () => {
      await forceAdvanceOneBlock()
    })

    it("Emits RampA event", async function () {
      await expect(
        this.metaSwap.rampA(
          100,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.emit(metaSwap, "RampA")
    })

    it("Succeeds to ramp upwards", async function () {
      // Create imbalanced pool to measure virtual price change
      // We expect virtual price to increase as A decreases
      await this.metaSwap.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256)

      // call rampA(), changing A to 100 within a span of 14 days
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
      await this.metaSwap.rampA(100, endTimestamp)

      // +0 seconds since ramp A
      expect(await this.metaSwap.getA()).to.be.eq(50)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5000)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await this.metaSwap.getA()).to.be.eq(54)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5413)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000258443200231295")

      // set timestamp to the end of ramp period
      await setTimestamp(endTimestamp)
      expect(await this.metaSwap.getA()).to.be.eq(100)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(10000)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000771363829405068")
    })

    it("Succeeds to ramp downwards", async function () {
      // Create imbalanced pool to measure virtual price change
      // We expect virtual price to decrease as A decreases
      await this.metaSwap.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256)

      // call rampA()
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
      await this.metaSwap.rampA(25, endTimestamp)

      // +0 seconds since ramp A
      expect(await this.metaSwap.getA()).to.be.eq(50)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5000)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await this.metaSwap.getA()).to.be.eq(47)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(4794)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000115870150391894")

      // set timestamp to the end of ramp period
      await setTimestamp(endTimestamp)
      expect(await this.metaSwap.getA()).to.be.eq(25)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(2500)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("998999574522335473")
    })

    it("Reverts when non-owner calls it", async function () {
      await expect(
        this.metaSwap
          .connect(this.user1)
          .rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.reverted
    })

    it("Reverts with 'Wait 1 day before starting ramp'", async function () {
      await this.metaSwap.rampA(
        55,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )
      await expect(
        this.metaSwap.rampA(
          55,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.be.revertedWith("Wait 1 day before starting ramp")
    })

    it("Reverts with 'Insufficient ramp time'", async function () {
      await expect(
        this.metaSwap.rampA(
          55,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS - 1,
        ),
      ).to.be.revertedWith("Insufficient ramp time")
    })

    it("Reverts with 'futureA_ must be > 0 and < MAX_A'", async function () {
      await expect(
        this.metaSwap.rampA(
          0,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.be.revertedWith("futureA_ must be > 0 and < MAX_A")
    })

    it("Reverts with 'futureA_ is too small'", async function () {
      await expect(
        this.metaSwap.rampA(
          24,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.be.revertedWith("futureA_ is too small")
    })

    it("Reverts with 'futureA_ is too large'", async function () {
      await expect(
        this.metaSwap.rampA(
          101,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.be.revertedWith("futureA_ is too large")
    })
  })

  describe("stopRampA", function () {
    it("Emits StopRampA event", async function () {
      // call rampA()
      await this.metaSwap.rampA(
        100,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100,
      )

      // Stop ramp
      expect(this.metaSwap.stopRampA()).to.emit(metaSwap, "StopRampA")
    })

    it("Stop ramp succeeds", async function () {
      // call rampA()
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
      await this.metaSwap.rampA(100, endTimestamp)

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await this.metaSwap.getA()).to.be.eq(54)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5413)

      // Stop ramp
      await this.metaSwap.stopRampA()
      expect(await this.metaSwap.getA()).to.be.eq(54)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5413)

      // set timestamp to endTimestamp
      await setTimestamp(endTimestamp)

      // verify ramp has stopped
      expect(await this.metaSwap.getA()).to.be.eq(54)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5413)
    })

    it("Reverts with 'Ramp is already stopped'", async function () {
      // call rampA()
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
      await this.metaSwap.rampA(100, endTimestamp)

      // set timestamp to +10000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await this.metaSwap.getA()).to.be.eq(54)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5413)

      // Stop ramp
      await this.metaSwap.stopRampA()
      expect(await this.metaSwap.getA()).to.be.eq(54)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5413)

      // check call reverts when ramp is already stopped
      await expect(this.metaSwap.stopRampA()).to.be.revertedWith(
        "Ramp is already stopped",
      )
    })
  })

  describe("Check for timestamp manipulations", function () {
    beforeEach(async () => {
      await forceAdvanceOneBlock()
    })

    it("Check for maximum differences in A and virtual price when A is increasing", async function () {
      // Create imbalanced pool to measure virtual price change
      // Sets the pool in 2:1 ratio where ust is significantly cheaper than lpToken
      await this.metaSwap.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256)

      // Initial A and virtual price
      expect(await this.metaSwap.getA()).to.be.eq(50)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5000)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // Start ramp
      await this.metaSwap.rampA(
        100,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900)

      expect(await this.metaSwap.getA()).to.be.eq(50)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5003)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000167862696363286")

      // Max increase of A between two blocks
      // 5003 / 5000
      // = 1.0006

      // Max increase of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
      // 1000167862696363286 / 1000167146429977312
      // = 1.00000071615
    })

    it("Check for maximum differences in A and virtual price when A is decreasing", async function () {
      // Create imbalanced pool to measure virtual price change
      // Sets the pool in 2:1 ratio where ust is significantly cheaper than lpToken
      await this.metaSwap.addLiquidity([String(1e18), 0], 0, this.MAX_UINT256)

      // Initial A and virtual price
      expect(await this.metaSwap.getA()).to.be.eq(50)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(5000)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // Start ramp
      await this.metaSwap.rampA(
        25,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900)

      expect(await this.metaSwap.getA()).to.be.eq(49)
      expect(await this.metaSwap.getAPrecise()).to.be.eq(4999)
      expect(await this.metaSwap.getVirtualPrice()).to.be.eq("1000166907487883089")

      // Max decrease of A between two blocks
      // 4999 / 5000
      // = 0.9998

      // Max decrease of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
      // 1000166907487883089 / 1000167146429977312
      // = 0.99999976109
    })

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

    describe("Check for attacks while A is ramping upwards", function () {
      let initialAttackerBalances: BigNumber[] = []
      let initialPoolBalances: BigNumber[] = []
      let attacker: Signer

      beforeEach(async () => {
        // This attack is achieved by creating imbalance in the first block then
        // trading in reverse direction in the second block.
        attacker = user1

        initialAttackerBalances = await getUserTokenBalances(attacker, [
          ust,
          swapLPToken,
        ])

        expect(initialAttackerBalances[0]).to.be.eq("100000000000000000000000")
        expect(initialAttackerBalances[1]).to.be.eq(String(3e20))

        // Start ramp upwards
        await this.metaSwap.rampA(
          100,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        )
        expect(await this.metaSwap.getAPrecise()).to.be.eq(5000)

        // Check current pool balances
        initialPoolBalances = [
          await this.metaSwap.getTokenBalance(0),
          await this.metaSwap.getTokenBalance(1),
        ]
        expect(initialPoolBalances[0]).to.be.eq(String(1e18))
        expect(initialPoolBalances[1]).to.be.eq(String(1e18))
      })

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of ust to lpToken, causing massive imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of lpToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from lpToken -> ust may be profitable in small sizes
            // ust balance in the pool  : 2.00e18
            // lpToken balance in the pool : 9.14e16
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "91408257454997694",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await this.metaSwap.getAPrecise()).to.be.eq(5003)

            // Trade lpToken to ust, taking advantage of the imbalance and change of A
            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("997214696574405737")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("2785303425594263")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 2.785e15 ust (0.2785% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = []
            finalPoolBalances.push(await this.metaSwap.getTokenBalance(0))
            finalPoolBalances.push(await this.metaSwap.getTokenBalance(1))

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "2785303425594263",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 2.785e15 ust (0.2785% of ust balance)
            // The attack did not benefit the attacker.
          })

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 1e18 of ust to lpToken, causing massive imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of lpToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from lpToken -> ust may be profitable in small sizes
            // ust balance in the pool  : 2.00e18
            // lpToken balance in the pool : 9.14e16
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "91408257454997694",
            )

            // Assume no transactions occur during 2 weeks
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await this.metaSwap.getAPrecise()).to.be.eq(10000)

            // Trade lpToken to ust, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("955743484403042509")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("44256515596957491")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 4.426e16 ust (4.426%)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "44256515596957491",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 4.426e16 ust (4.426% of ust balance of the pool)
            // The attack did not benefit the attacker.
          })
        },
      )

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          beforeEach(async () => {
            // Set up pool to be imbalanced prior to the attack
            await this.metaSwap
              .connect(this.user2)
              .addLiquidity(
                [String(0), String(2e18)],
                0,
                (await getCurrentBlockTimestamp()) + 60,
              )

            // Check current pool balances
            initialPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]
            expect(initialPoolBalances[0]).to.be.eq(String(1e18))
            expect(initialPoolBalances[1]).to.be.eq(String(3e18))
          })

          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of ust to lpToken, resolving imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 1.012e18 of lpToken
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 lpToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // ust balance in the pool  : 2.000e18
            // lpToken balance in the pool : 1.988e18
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await this.metaSwap.getAPrecise()).to.be.eq(5003)

            // Trade lpToken to ust, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the attacker leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("998017518949630644")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("1982481050369356")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 1.982e15 ust (0.1982% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = []
            finalPoolBalances.push(await this.metaSwap.getTokenBalance(0))
            finalPoolBalances.push(await this.metaSwap.getTokenBalance(1))

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "1982481050369356",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.982e15 ust (0.1982% of ust balance)
            // The attack did not benefit the attacker.
          })

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 1e18 of ust to lpToken, resolving the imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of lpToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // ust balance in the pool  : 2.000e18
            // lpToken balance in the pool : 1.988e18
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Assume 2 weeks go by without any other transactions
            // This mimics rapid change of A
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await this.metaSwap.getAPrecise()).to.be.eq(10000)

            // Trade lpToken to ust, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("1004298818514364451")
            // Attack was successful!

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            expect(initialAttackerBalances[0]).to.be.lt(
              finalAttackerBalances[0],
            )
            expect(initialAttackerBalances[1]).to.be.eq(
              finalAttackerBalances[1],
            )
            expect(
              finalAttackerBalances[0].sub(initialAttackerBalances[0]),
            ).to.be.eq("4298818514364451")
            expect(
              finalAttackerBalances[1].sub(initialAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker gained 4.430e15 ust (0.430%)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq(
              "4298818514364451",
            )
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) lost 4.430e15 ust (0.430% of ust balance)

            // The attack benefited the attacker.
            // Note that this attack is only possible when there are no swaps happening during the 2 weeks ramp period.
          })
        },
      )
    })

    describe("Check for attacks while A is ramping downwards", function () {
      let initialAttackerBalances: BigNumber[] = []
      let initialPoolBalances: BigNumber[] = []
      let attacker: Signer

      beforeEach(async () => {
        // Set up the downward ramp A
        attacker = user1

        initialAttackerBalances = await getUserTokenBalances(attacker, [
          ust,
          swapLPToken,
        ])

        expect(initialAttackerBalances[0]).to.be.eq("100000000000000000000000")
        expect(initialAttackerBalances[1]).to.be.eq(String(3e20))

        // Start ramp downwards
        await this.metaSwap.rampA(
          25,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        )
        expect(await this.metaSwap.getAPrecise()).to.be.eq(5000)

        // Check current pool balances
        initialPoolBalances = [
          await this.metaSwap.getTokenBalance(0),
          await this.metaSwap.getTokenBalance(1),
        ]
        expect(initialPoolBalances[0]).to.be.eq(String(1e18))
        expect(initialPoolBalances[1]).to.be.eq(String(1e18))
      })

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          // This attack is achieved by creating imbalance in the first block then
          // trading in reverse direction in the second block.

          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of ust to lpToken, causing massive imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of lpToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from lpToken -> ust may be profitable in small sizes
            // ust balance in the pool  : 2.00e18
            // lpToken balance in the pool : 9.14e16
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "91408257454997694",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed downwards
            expect(await this.metaSwap.getAPrecise()).to.be.eq(4999)

            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("997276754500361021")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("2723245499638979")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 2.723e15 ust (0.2723% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "2723245499638979",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 2.723e15 ust (0.2723% of ust balance)
            // The attack did not benefit the attacker.
          })

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test is to show how dangerous rapid A ramp is.

            // Swap 1e18 of ust to lpToken, causing massive imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of lpToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from lpToken -> ust may be profitable in small sizes
            // ust balance in the pool  : 2.00e18
            // lpToken balance in the pool : 9.14e16
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "91408257454997694",
            )

            // Assume no transactions occur during 2 weeks ramp time
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed downwards
            expect(await this.metaSwap.getAPrecise()).to.be.eq(2500)

            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("1066252480054180588")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.gt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              finalAttackerBalances[0].sub(initialAttackerBalances[0]),
            ).to.be.eq("66252480054180588")
            expect(
              finalAttackerBalances[1].sub(initialAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker gained 6.625e16 ust (6.625% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq(
              "66252480054180588",
            )
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) lost 6.625e16 ust (6.625% of ust balance)

            // The attack was successful. The change of A (-50%) gave the attacker a chance to swap
            // more efficiently. The swap fee (0.1%) was not sufficient to counter the efficient trade, giving
            // the attacker more tokens than initial deposit.
          })
        },
      )

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          beforeEach(async () => {
            // Set up pool to be imbalanced prior to the attack
            await this.metaSwap
              .connect(this.user2)
              .addLiquidity(
                [String(0), String(2e18)],
                0,
                (await getCurrentBlockTimestamp()) + 60,
              )

            // Check current pool balances
            initialPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]
            expect(initialPoolBalances[0]).to.be.eq(String(1e18))
            expect(initialPoolBalances[1]).to.be.eq(String(3e18))
          })

          it("Attack fails with 900 seconds between blocks", async function () {
            // Swap 1e18 of ust to lpToken, resolving imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 1.012e18 of lpToken
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 lpToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // ust balance in the pool  : 2.000e18
            // lpToken balance in the pool : 1.988e18
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed downwards
            expect(await this.metaSwap.getAPrecise()).to.be.eq(4999)

            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("998007711333645455")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("1992288666354545")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 1.992e15 ust (0.1992% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "1992288666354545",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.992e15 ust (0.1992% of ust balance)
            // The attack did not benefit the attacker.
          })

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async function () {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test case is to mimic rapid ramp down of A.

            // Swap 1e18 of ust to lpToken, resolving imbalance in the pool
            await this.metaSwap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, this.MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, this.swapLPToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 1.012e18 of lpToken
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 lpToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // ust balance in the pool  : 2.000e18
            // lpToken balance in the pool : 1.988e18
            expect(await this.metaSwap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await this.metaSwap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed downwards
            expect(await this.metaSwap.getAPrecise()).to.be.eq(2500)

            const balanceBefore = await getUserTokenBalance(attacker, ust)
            await this.metaSwap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, this.MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, ust)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more ust than the start.
            expect(firstTokenOutput).to.be.eq("986318317546604072")
            // Attack was not successful

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              ust,
              swapLPToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("13681682453395928")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 1.368e16 ust (1.368% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await this.metaSwap.getTokenBalance(0),
              await this.metaSwap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "13681682453395928",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.368e16 ust (1.368% of ust balance)
            // The attack did not benefit the attacker
          })
        },
      )
    })
  })
  */
})
