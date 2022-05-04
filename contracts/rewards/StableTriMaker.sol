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

    event LogWithdrawFees();

    event LogSwapStableTokenToTri(address stableTokenToConvertToTri, address[] triConversionPath);

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

    function withdrawStableTokenFees(
        address swap // Stableswap Pool
    ) public onlyEOA {
        // Withdraw admin fees from the Stableswap Pool to stable tokens
        ISwap(swap).withdrawAdminFees();

        emit LogWithdrawFees();
    }

    function swapStableTokensToTri(
        address[] calldata stableTokensToRemoveTo, // Stable tokens to remove from the LP at the same index
        address[][] calldata triConversionPaths // Tri conversion paths for each stable token, first address is the stable token removed and last address is always TRI
    ) public onlyEOA {
        for (uint256 i = 0; i < stableTokensToRemoveTo.length; i++) {
            IERC20(stableTokensToRemoveTo[i]).approve(
                address(router),
                IERC20(stableTokensToRemoveTo[i]).balanceOf(address(this))
            );

            uint256 pathLength = triConversionPaths[i].length;
            require(
                triConversionPaths[i][0] == stableTokensToRemoveTo[i],
                "StableTriMaker: invalid tri conversion path"
            );
            require(triConversionPaths[i][pathLength - 1] == tri, "StableTriMaker: invalid tri conversion path");

            IUniswapV2Router02(router).swapExactTokensForTokens(
                IERC20(stableTokensToRemoveTo[i]).balanceOf(address(this)),
                0,
                triConversionPaths[i],
                address(this),
                block.timestamp + 5 minutes
            );

            emit LogSwapStableTokenToTri(stableTokensToRemoveTo[i], triConversionPaths[i]);
        }
    }

    function sendTriToBar() public onlyEOA {
        // Check the balanceOf converted TRI and send to bar for dishing up
        uint256 triAmount = IERC20(tri).balanceOf(address(this));
        require(triAmount > 0, "StableTriMaker: no Tri to send");
        IERC20(tri).safeTransfer(bar, triAmount);

        emit LogTriSentToBar(triAmount);
    }

    function convertStables(
        address swap, // Stableswap Pool
        address[] calldata stableTokensToRemoveTo, // Stable tokens to remove from the LP at the same index
        address[][] calldata triConversionPaths // Tri conversion paths for each stable token, first address is the stable token removed and last address is always TRI
    ) external onlyEOA {
        // Withdraw admin fees from the Stableswap Pool to stable tokens
        withdrawStableTokenFees(swap);

        // For each stable token, we need to convert it to tri via the router and its corresponding path
        swapStableTokensToTri(stableTokensToRemoveTo, triConversionPaths);

        // Converted stable tokens to tri get sent to bar for xTRI APR
        sendTriToBar();
    }
}
