// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.4;

import { IGUniRouter } from "../interfaces/IGUniRouter.sol";
import { IGUniPool } from "../interfaces/IGUniPool.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IERC20, SafeERC20 } from "@openzeppelin/contracts-084/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts-084/utils/Address.sol";
import { IUniswapV3SwapCallback } from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import { IUniswapV3Factory } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable-084/proxy/utils/Initializable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable-084/security/PausableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable-084/access/OwnableUpgradeable.sol";

contract GUniRouter is IGUniRouter, IUniswapV3SwapCallback, Initializable, PausableUpgradeable, OwnableUpgradeable {
    using Address for address payable;
    using SafeERC20 for IERC20;

    IWETH public immutable weth;
    IUniswapV3Factory public immutable factory;

    constructor(IUniswapV3Factory _factory, IWETH _weth) {
        weth = _weth;
        factory = _factory;
    }

    function initialize() external initializer {
        __Pausable_init();
        __Ownable_init();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Uniswap v3 callback fn, called back on pool.swap
    // solhint-disable-next-line code-complexity
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata
    ) external override {
        IUniswapV3Pool pool = IUniswapV3Pool(msg.sender);
        address token0 = pool.token0();
        address token1 = pool.token1();
        uint24 fee = pool.fee();

        require(msg.sender == factory.getPool(token0, token1, fee), "invalid uniswap pool");

        if (amount0Delta > 0) IERC20(token0).safeTransfer(msg.sender, uint256(amount0Delta));
        else if (amount1Delta > 0) IERC20(token1).safeTransfer(msg.sender, uint256(amount1Delta));
    }

    /// @notice addLiquidity adds liquidity to G-UNI pool of interest (mints G-UNI LP tokens)
    /// @param pool address of G-UNI pool to add liquidity to
    /// @param amount0Max the maximum amount of token0 msg.sender willing to input
    /// @param amount1Max the maximum amount of token1 msg.sender willing to input
    /// @param amount0Min the minimum amount of token0 actually input (slippage protection)
    /// @param amount1Min the minimum amount of token1 actually input (slippage protection)
    /// @param receiver account to receive minted G-UNI tokens
    /// @return amount0 amount of token0 transferred from msg.sender to mint `mintAmount`
    /// @return amount1 amount of token1 transferred from msg.sender to mint `mintAmount`
    /// @return mintAmount amount of G-UNI tokens minted and transferred to `receiver`
    // solhint-disable-next-line function-max-lines
    function addLiquidity(
        IGUniPool pool,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        override
        whenNotPaused
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        IERC20 token0 = pool.token0();
        IERC20 token1 = pool.token1();

        (uint256 amount0In, uint256 amount1In, uint256 _mintAmount) = pool.getMintAmounts(amount0Max, amount1Max);
        require(amount0In >= amount0Min && amount1In >= amount1Min, "below min amounts");
        if (amount0In > 0) {
            token0.safeTransferFrom(msg.sender, address(this), amount0In);
        }
        if (amount1In > 0) {
            token1.safeTransferFrom(msg.sender, address(this), amount1In);
        }

        return _deposit(pool, amount0In, amount1In, _mintAmount, receiver);
    }

    /// @notice addLiquidityETH same as addLiquidity but expects ETH transfers (instead of WETH)
    // solhint-disable-next-line code-complexity, function-max-lines
    function addLiquidityETH(
        IGUniPool pool,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        payable
        override
        whenNotPaused
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        IERC20 token0 = pool.token0();
        IERC20 token1 = pool.token1();

        (uint256 amount0In, uint256 amount1In, uint256 _mintAmount) = pool.getMintAmounts(amount0Max, amount1Max);
        require(amount0In >= amount0Min && amount1In >= amount1Min, "below min amounts");

        if (_isToken0Weth(address(token0), address(token1))) {
            require(amount0Max == msg.value, "mismatching amount of ETH forwarded");
            if (amount0In > 0) {
                weth.deposit{ value: amount0In }();
            }
            if (amount1In > 0) {
                token1.safeTransferFrom(msg.sender, address(this), amount1In);
            }
        } else {
            require(amount1Max == msg.value, "mismatching amount of ETH forwarded");
            if (amount1In > 0) {
                weth.deposit{ value: amount1In }();
            }
            if (amount0In > 0) {
                token0.safeTransferFrom(msg.sender, address(this), amount0In);
            }
        }

        (amount0, amount1, mintAmount) = _deposit(pool, amount0In, amount1In, _mintAmount, receiver);

        if (_isToken0Weth(address(token0), address(token1))) {
            if (amount0Max > amount0In) {
                payable(msg.sender).sendValue(amount0Max - amount0In);
            }
        } else {
            if (amount1Max > amount1In) {
                payable(msg.sender).sendValue(amount1Max - amount1In);
            }
        }
    }

    /// @notice rebalanceAndAddLiquidity accomplishes same task as addLiquidity/addLiquidityETH
    /// but msg.sender rebalances their holdings (performs a swap) before adding liquidity.
    /// @param pool address of G-UNI pool to add liquidity to
    /// @param amount0In the amount of token0 msg.sender forwards to router
    /// @param amount1In the amount of token1 msg.sender forwards to router
    /// @param zeroForOne Which token to swap (true = token0, false = token1)
    /// @param swapAmount the amount of token to swap
    /// @param swapThreshold the slippage parameter of the swap as a min or max sqrtPriceX96
    /// @param amount0Min the minimum amount of token0 actually deposited (slippage protection)
    /// @param amount1Min the minimum amount of token1 actually deposited (slippage protection)
    /// @param receiver account to receive minted G-UNI tokens
    /// @return amount0 amount of token0 actually deposited into pool
    /// @return amount1 amount of token1 actually deposited into pool
    /// @return mintAmount amount of G-UNI tokens minted and transferred to `receiver`
    /// @dev because router performs a swap on behalf of msg.sender and slippage is possible
    /// some value unused in mint can be returned to msg.sender in token0 and token1 make sure
    /// to consult return values or measure balance changes after a rebalanceAndAddLiquidity call.
    // solhint-disable-next-line function-max-lines
    function rebalanceAndAddLiquidity(
        IGUniPool pool,
        uint256 amount0In,
        uint256 amount1In,
        bool zeroForOne,
        uint256 swapAmount,
        uint160 swapThreshold,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        override
        whenNotPaused
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        (uint256 amount0Use, uint256 amount1Use, uint256 _mintAmount) = _prepareRebalanceDeposit(
            pool,
            amount0In,
            amount1In,
            zeroForOne,
            swapAmount,
            swapThreshold
        );
        require(amount0Use >= amount0Min && amount1Use >= amount1Min, "below min amounts");

        return _deposit(pool, amount0Use, amount1Use, _mintAmount, receiver);
    }

    /// @notice rebalanceAndAddLiquidityETH same as rebalanceAndAddLiquidity
    /// except this function expects ETH transfer (instead of WETH)
    // solhint-disable-next-line function-max-lines, code-complexity
    function rebalanceAndAddLiquidityETH(
        IGUniPool pool,
        uint256 amount0In,
        uint256 amount1In,
        bool zeroForOne,
        uint256 swapAmount,
        uint160 swapThreshold,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        payable
        override
        whenNotPaused
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        (uint256 amount0Use, uint256 amount1Use, uint256 _mintAmount) = _prepareAndRebalanceDepositETH(
            pool,
            amount0In,
            amount1In,
            zeroForOne,
            swapAmount,
            swapThreshold
        );
        require(amount0Use >= amount0Min && amount1Use >= amount1Min, "below min amounts");

        (amount0, amount1, mintAmount) = _deposit(pool, amount0Use, amount1Use, _mintAmount, receiver);

        uint256 leftoverBalance = IERC20(address(weth)).balanceOf(address(this));
        if (leftoverBalance > 0) {
            weth.withdraw(leftoverBalance);
            payable(msg.sender).sendValue(leftoverBalance);
        }
    }

    /// @notice removeLiquidity removes liquidity from a G-UNI pool and burns G-UNI LP tokens
    /// @param burnAmount The number of G-UNI tokens to burn
    /// @param amount0Min Minimum amount of token0 received after burn (slippage protection)
    /// @param amount1Min Minimum amount of token1 received after burn (slippage protection)
    /// @param receiver The account to receive the underlying amounts of token0 and token1
    /// @return amount0 actual amount of token0 transferred to receiver for burning `burnAmount`
    /// @return amount1 actual amount of token1 transferred to receiver for burning `burnAmount`
    /// @return liquidityBurned amount of liquidity removed from the underlying Uniswap V3 position
    function removeLiquidity(
        IGUniPool pool,
        uint256 burnAmount,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    )
        external
        override
        whenNotPaused
        returns (
            uint256 amount0,
            uint256 amount1,
            uint128 liquidityBurned
        )
    {
        IERC20(address(pool)).safeTransferFrom(msg.sender, address(this), burnAmount);
        (amount0, amount1, liquidityBurned) = pool.burn(burnAmount, receiver);
        require(amount0 >= amount0Min && amount1 >= amount1Min, "received below minimum");
    }

    /// @notice removeLiquidityETH same as removeLiquidity
    /// except this function unwraps WETH and sends ETH to receiver account
    // solhint-disable-next-line code-complexity, function-max-lines
    function removeLiquidityETH(
        IGUniPool pool,
        uint256 burnAmount,
        uint256 amount0Min,
        uint256 amount1Min,
        address payable receiver
    )
        external
        override
        whenNotPaused
        returns (
            uint256 amount0,
            uint256 amount1,
            uint128 liquidityBurned
        )
    {
        IERC20 token0 = pool.token0();
        IERC20 token1 = pool.token1();

        bool wethToken0 = _isToken0Weth(address(token0), address(token1));

        IERC20(address(pool)).safeTransferFrom(msg.sender, address(this), burnAmount);
        (amount0, amount1, liquidityBurned) = pool.burn(burnAmount, address(this));
        require(amount0 >= amount0Min && amount1 >= amount1Min, "received below minimum");

        if (wethToken0) {
            if (amount0 > 0) {
                weth.withdraw(amount0);
                receiver.sendValue(amount0);
            }
            if (amount1 > 0) {
                token1.safeTransfer(receiver, amount1);
            }
        } else {
            if (amount1 > 0) {
                weth.withdraw(amount1);
                receiver.sendValue(amount1);
            }
            if (amount0 > 0) {
                token0.safeTransfer(receiver, amount0);
            }
        }
    }

    function _deposit(
        IGUniPool pool,
        uint256 amount0In,
        uint256 amount1In,
        uint256 _mintAmount,
        address receiver
    )
        internal
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 mintAmount
        )
    {
        if (amount0In > 0) {
            pool.token0().safeIncreaseAllowance(address(pool), amount0In);
        }
        if (amount1In > 0) {
            pool.token1().safeIncreaseAllowance(address(pool), amount1In);
        }

        (amount0, amount1, ) = pool.mint(_mintAmount, receiver);
        require(amount0 == amount0In && amount1 == amount1In, "unexpected amounts deposited");
        mintAmount = _mintAmount;
    }

    // solhint-disable-next-line function-max-lines
    function _prepareRebalanceDeposit(
        IGUniPool pool,
        uint256 amount0In,
        uint256 amount1In,
        bool zeroForOne,
        uint256 swapAmount,
        uint160 swapThreshold
    )
        internal
        returns (
            uint256 amount0Use,
            uint256 amount1Use,
            uint256 mintAmount
        )
    {
        IERC20 token0 = pool.token0();
        IERC20 token1 = pool.token1();
        if (amount0In > 0) {
            token0.safeTransferFrom(msg.sender, address(this), amount0In);
        }
        if (amount1In > 0) {
            token1.safeTransferFrom(msg.sender, address(this), amount1In);
        }

        _swap(pool, zeroForOne, int256(swapAmount), swapThreshold);

        uint256 amount0Max = token0.balanceOf(address(this));
        uint256 amount1Max = token1.balanceOf(address(this));

        (amount0Use, amount1Use, mintAmount) = _getAmountsAndRefund(pool, amount0Max, amount1Max);
    }

    // solhint-disable-next-line code-complexity, function-max-lines
    function _prepareAndRebalanceDepositETH(
        IGUniPool pool,
        uint256 amount0In,
        uint256 amount1In,
        bool zeroForOne,
        uint256 swapAmount,
        uint160 swapThreshold
    )
        internal
        returns (
            uint256 amount0Use,
            uint256 amount1Use,
            uint256 mintAmount
        )
    {
        IERC20 token0 = pool.token0();
        IERC20 token1 = pool.token1();
        bool wethToken0 = _isToken0Weth(address(token0), address(token1));

        if (amount0In > 0) {
            if (wethToken0) {
                require(amount0In == msg.value, "mismatching amount of ETH forwarded");
                weth.deposit{ value: amount0In }();
            } else {
                token0.safeTransferFrom(msg.sender, address(this), amount0In);
            }
        }

        if (amount1In > 0) {
            if (wethToken0) {
                token1.safeTransferFrom(msg.sender, address(this), amount1In);
            } else {
                require(amount1In == msg.value, "mismatching amount of ETH forwarded");
                weth.deposit{ value: amount1In }();
            }
        }

        _swap(pool, zeroForOne, int256(swapAmount), swapThreshold);

        uint256 amount0Max = token0.balanceOf(address(this));
        uint256 amount1Max = token1.balanceOf(address(this));

        (amount0Use, amount1Use, mintAmount) = _getAmountsAndRefundExceptETH(pool, amount0Max, amount1Max, wethToken0);
    }

    function _swap(
        IGUniPool pool,
        bool zeroForOne,
        int256 swapAmount,
        uint160 swapThreshold
    ) internal {
        pool.pool().swap(address(this), zeroForOne, swapAmount, swapThreshold, "");
    }

    function _getAmountsAndRefund(
        IGUniPool pool,
        uint256 amount0Max,
        uint256 amount1Max
    )
        internal
        returns (
            uint256 amount0In,
            uint256 amount1In,
            uint256 mintAmount
        )
    {
        (amount0In, amount1In, mintAmount) = pool.getMintAmounts(amount0Max, amount1Max);
        if (amount0Max > amount0In) {
            pool.token0().safeTransfer(msg.sender, amount0Max - amount0In);
        }
        if (amount1Max > amount1In) {
            pool.token1().safeTransfer(msg.sender, amount1Max - amount1In);
        }
    }

    function _getAmountsAndRefundExceptETH(
        IGUniPool pool,
        uint256 amount0Max,
        uint256 amount1Max,
        bool wethToken0
    )
        internal
        returns (
            uint256 amount0In,
            uint256 amount1In,
            uint256 mintAmount
        )
    {
        (amount0In, amount1In, mintAmount) = pool.getMintAmounts(amount0Max, amount1Max);

        if (amount0Max > amount0In && !wethToken0) {
            pool.token0().safeTransfer(msg.sender, amount0Max - amount0In);
        } else if (amount1Max > amount1In && wethToken0) {
            pool.token1().safeTransfer(msg.sender, amount1Max - amount1In);
        }
    }

    function _isToken0Weth(address token0, address token1) internal view returns (bool wethToken0) {
        if (token0 == address(weth)) {
            wethToken0 = true;
        } else if (token1 == address(weth)) {
            wethToken0 = false;
        } else {
            revert("one pool token must be WETH");
        }
    }
}
