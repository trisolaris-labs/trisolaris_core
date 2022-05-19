// SPDX-License-Identifier: MIT
// P1 - P3: OK
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ISwap.sol";

contract StableUsnMaker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    ISwap public stableSwap;
    address public pTri;
    address private immutable usn;
    address private immutable usdc;
    address private immutable usdt;
    address private immutable tlpToken;

    event LogSetpTri(address oldpTri, address newpTri);
    event LogSetStableSwap(address oldStableSwap, address newStableSwap);

    event LogWithdrawFees();

    event LogSwapStableTokenToUsn(address stableTokenToConvertToUsn, uint256 stableTokenAmount);
    event LogAddliquidityToStableSwap(uint256 usnAmount);

    event LogLpTokensSentTopTRI(uint256 tlpAmount);

    constructor(
        address _stableSwap,
        address _pTri,
        address _usn,
        address _usdt,
        address _usdc ,
        address _tlpToken
    ) public {
        stableSwap = ISwap(_stableSwap);
        pTri = _pTri;
        usn = _usn;
        usdt = _usdt;
        usdc = _usdc;
        tlpToken = _tlpToken;
    }

    function setStableSwap(ISwap _stableSwap) public onlyOwner {
        stableSwap = _stableSwap;

        emit LogSetStableSwap(address(stableSwap), address(_stableSwap));
    }

    function setpTri(address _pTri) public onlyOwner {
        address oldpTri;
        oldpTri = pTri;
        pTri = _pTri;

        emit LogSetpTri(oldpTri, _pTri);
    }

    // C6: It's not a fool proof solution, but it prevents flash loans, so here it's ok to use tx.origin
    modifier onlyEOA() {
        // Try to make flash-loan exploit harder to do by only allowing externally owned addresses.
        require(msg.sender == tx.origin, "StableUsnMaker: must use EOA");
        _;
    }

    function withdrawStableTokenFees() public onlyEOA {
        // Withdraw admin fees from the Stableswap Pool to stable tokens
        stableSwap.withdrawAdminFees();

        emit LogWithdrawFees();
    }

    // This onyl works for USDC and USDT. If we have more tokens, need to make this more dynamic
    function swapStableTokensToUsn() public onlyEOA {
        address[2] memory stableTokensToSwapToUsn = [usdc, usdt];
        for (uint256 i = 0; i < stableTokensToSwapToUsn.length; i++) {
            IERC20(stableTokensToSwapToUsn[i]).approve(
                address(stableSwap),
                IERC20(stableTokensToSwapToUsn[i]).balanceOf(address(this))
            );

            uint256 stableTokenAmount = IERC20(stableTokensToSwapToUsn[i]).balanceOf(address(this));

            stableSwap.swap(
                stableSwap.getTokenIndex(stableTokensToSwapToUsn[i]),
                stableSwap.getTokenIndex(usn),
                stableTokenAmount,
                0,
                block.timestamp + 60
            );

            emit LogSwapStableTokenToUsn(stableTokensToSwapToUsn[i], stableTokenAmount);
        }
    }

    function addLiquidityToStableSwap() public onlyEOA {
        uint256 usnAmount = IERC20(usn).balanceOf(address(this));
        require(usnAmount > 0, "StableUsnMaker: no Usn to add liquidity");
        uint256[] memory ma = new uint[](3);
        ma[0] = 0;
        ma[1] = 0;
        ma[2] = usnAmount;
        stableSwap.addLiquidity(
            ma,
            0,
            block.timestamp + 60
        );

        emit LogAddliquidityToStableSwap(usnAmount);
    }

    function sendLpTokenTopTri() public onlyEOA {
        // Check the balanceOf converted TLP and send to pTri for dishing out
        uint256 tlpAmount = IERC20(tlpToken).balanceOf(address(this));
        require(tlpAmount > 0, "StableUsnMaker: no TLP to send");
        IERC20(tlpToken).safeTransfer(pTri, tlpAmount);

        emit LogLpTokensSentTopTRI(tlpAmount);
    }

    // Emergency Withdraw function
    function reclaimTokens(address token, uint256 amount, address payable to) public onlyOwner {
        if (token == address(0)) {
            to.transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function convertStables() external onlyEOA {
        // Withdraw admin fees from the stableswap pool to stable tokens
        withdrawStableTokenFees();

        // For each stable token, we need to convert it to usn via the stableswap
        swapStableTokensToUsn();

        // Add USN liquidity to the stable swap
        addLiquidityToStableSwap();

        // Converted stable tokens to usn get sent to LP Maker
        sendLpTokenTopTri();
    }
}
