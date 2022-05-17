// SPDX-License-Identifier: MIT
// P1 - P3: OK
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ISwap.sol";

contract StableTriMaker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    ISwap public stableSwap;
    address public lpMaker;
    address private immutable usn = address(0x0);
    address private immutable usdc = address(0x0);
    address private immutable usdt = address(0x0);

    event LogSetLPMaker(address oldLPMaker, address newLPMaker);
    event LogSetStableSwap(address oldStableSwap, address newStableSwap);

    event LogWithdrawFees();

    event LogSwapStableTokenToUsn(address stableTokenToConvertToUsn, uint256 stableTokenAmount);

    event LogUsnSentToLPMaker(uint256 usnAmount);

    constructor(ISwap _stableSwap, address _lpMaker) public {
        stableSwap = ISwap(_stableSwap);
        lpMaker = _lpMaker;
    }

    function setStableSwap(ISwap _stableSwap) public onlyOwner {
        stableSwap = _stableSwap;

        emit LogSetStableSwap(address(stableSwap), address(_stableSwap));
    }

    function setLPMaker(address _lpMaker) public onlyOwner {
        lpMaker = _lpMaker;

        emit LogSetLPMaker(address(lpMaker), _lpMaker);
    }

    // C6: It's not a fool proof solution, but it prevents flash loans, so here it's ok to use tx.origin
    modifier onlyEOA() {
        // Try to make flash-loan exploit harder to do by only allowing externally owned addresses.
        require(msg.sender == tx.origin, "StableTriMaker: must use EOA");
        _;
    }

    function withdrawStableTokenFees() public onlyEOA {
        // Withdraw admin fees from the Stableswap Pool to stable tokens
        stableSwap.withdrawAdminFees();

        emit LogWithdrawFees();
    }

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

    function sendUsnToLPMaker() public onlyEOA {
        // Check the balanceOf converted TRI and send to bar for dishing up
        uint256 usnAmount = IERC20(usn).balanceOf(address(this));
        require(usnAmount > 0, "StableTriMaker: no Usn to send");
        IERC20(usn).safeTransfer(lpMaker, usnAmount);

        emit LogUsnSentToLPMaker(usnAmount);
    }

    function convertStables() external onlyEOA {
        // Withdraw admin fees from the stableswap pool to stable tokens
        withdrawStableTokenFees();

        // For each stable token, we need to convert it to usn via the stableswap
        swapStableTokensToUsn();

        // Converted stable tokens to usn get sent to LP Maker
        sendUsnToLPMaker();
    }
}
