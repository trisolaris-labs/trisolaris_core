// SPDX-License-Identifier: MIT
// P1 - P3: OK
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../amm/interfaces/IUniswapV2ERC20.sol";
import "../amm/interfaces/IUniswapV2Factory.sol";
import "../amm/interfaces/IUniswapV2Router02.sol";
import "../interfaces/ISwap.sol";

// StableTriMaker is MasterChef's left hand and kinda a wizard. He can cook up Tri from pretty much anything!
// This contract handles "serving up" rewards for xTri holders by trading stableswap tokens collected from fees for Tri.

contract StableTriMaker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IUniswapV2Router02 public immutable router;
    address public immutable bar;
    address private immutable tri;

    event LogRemoveLiquidity(
        address swapLpToken,
        address[] stableTokensToRemoveTo,
        uint256[] stableTokensToRemoveAmounts
    );

    event LogSwapStableTokenToTri(
        address stableTokenToConvertToTri,
        address[] triConversionPath,
        uint256 stableTokenAmount
    );

    event LogTriSentToBar(uint256 triAmount);

    constructor(
        address _router,
        address _bar,
        address _tri
    ) public {
        router = IUniswapV2Router02(_router);
        bar = _bar;
        tri = _tri;
    }

    // C6: It's not a fool proof solution, but it prevents flash loans, so here it's ok to use tx.origin
    modifier onlyEOA() {
        // Try to make flash-loan exploit harder to do by only allowing externally owned addresses.
        require(msg.sender == tx.origin, "StableTriMaker: must use EOA");
        _;
    }

    function convertStables(
        address swap, // Stableswap Pool
        address swapLpToken, // Stableswap LP token that this contract holds a non-zero balanceOf
        address[] calldata stableTokensToRemoveTo, // Stable tokens to remove from the LP at the same index
        address[][] calldata triConversionPaths // Tri conversion paths for each stable token, first address is the stable token removed and last address is always TRI
    ) external onlyEOA {
        // Remove liquidity from stableswap lp into stableTokensToRemoveTo arg
        uint256 stableTokensBalance = IERC20(swapLpToken).balanceOf(address(this));
        IERC20(swapLpToken).approve(swap, stableTokensBalance);
        uint256[] memory stableTokensToRemoveAmounts = ISwap(swap).calculateRemoveLiquidity(stableTokensBalance);
        ISwap(swap).removeLiquidity(stableTokensBalance, stableTokensToRemoveAmounts, block.timestamp + 5 minutes);

        emit LogRemoveLiquidity(swapLpToken, stableTokensToRemoveTo, stableTokensToRemoveAmounts);

        // For each stablecoin, we need to convert it to tri via the router and its corresponding stable->x->tri via triConversionPaths
        for (uint256 i = 0; i < stableTokensToRemoveTo.length; i++) {
            IERC20(stableTokensToRemoveTo[i]).approve(address(router), stableTokensBalance);

            IUniswapV2Router02(router).swapExactTokensForTokens(
                IERC20(stableTokensToRemoveTo[i]).balanceOf(address(this)),
                0,
                triConversionPaths[i],
                address(this),
                block.timestamp + 5 minutes
            );

            emit LogSwapStableTokenToTri(
                stableTokensToRemoveTo[i],
                triConversionPaths[i],
                stableTokensToRemoveAmounts[i]
            );
        }

        // Check the balanceOf converted TRI and send to bar for dishing up
        uint256 triAmount = IERC20(tri).balanceOf(address(this));
        IERC20(tri).safeTransfer(bar, triAmount);

        emit LogTriSentToBar(triAmount);
    }
}
