// SPDX-License-Identifier: MIT
// P1 - P3: OK
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ISwap.sol";

contract StableLPMaker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // pTri is the contract that disburses TLP tokens 
    // tlpToken is the trisolaris lp token address
    // dao is the dao address that receives funds

    ISwap public stableSwap;
    address public pTri;
    address private immutable usn;
    address private immutable usdc;
    address private immutable usdt;
    address private immutable tlpToken;
    address public dao;

    uint256 public polPercent; 

    event LogSetpTri(address oldpTri, address newpTri);
    event LogSetdao(address oldDao, address newDao);
    event LogSetStableSwap(address oldStableSwap, address newStableSwap);
    event LogProtocolOwnedLiquidity(uint256 oldpolPercent, uint256 newStableSwap);

    event LogWithdrawFees();

    event LogSwapStableTokenToUsn(address stableTokenToConvertToUsn, uint256 stableTokenAmount);
    event LogAddliquidityToStableSwap(uint256 usnAmount);

    event LogLpTokensSentTopTRI(uint256 tlpAmount);
    event LogLpTokensSentToDao(uint256 daoAmount);

    constructor(
        address _stableSwap,
        address _pTri,
        address _usn,
        address _usdt,
        address _usdc ,
        address _tlpToken,
        address _dao
    ) public {
        stableSwap = ISwap(_stableSwap);
        pTri = _pTri;
        usn = _usn;
        usdt = _usdt;
        usdc = _usdc;
        tlpToken = _tlpToken;
        dao = _dao;
    }

    // C6: It's not a fool proof solution, but it prevents flash loans, so here it's ok to use tx.origin
    modifier onlyEOA() {
        // Try to make flash-loan exploit harder to do by only allowing externally owned addresses.
        require(msg.sender == tx.origin, "StableLPMaker: must use EOA");
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
            uint256 minAmount = stableTokenAmount.mul(999).div(1005);
            stableSwap.swap(
                stableSwap.getTokenIndex(stableTokensToSwapToUsn[i]),
                stableSwap.getTokenIndex(usn),
                stableTokenAmount,
                minAmount,
                block.timestamp + 60
            );

            emit LogSwapStableTokenToUsn(stableTokensToSwapToUsn[i], stableTokenAmount);
        }
    }

    function addLiquidityToStableSwap() public onlyEOA {
        uint256 usnAmount = IERC20(usn).balanceOf(address(this));
        require(usnAmount > 0, "StableLPMaker: no Usn to add liquidity");

        IERC20(usn).approve(
            address(stableSwap),
            usnAmount
        );

        uint256[] memory ma = new uint[](3);
        ma[2] = usnAmount;
        stableSwap.addLiquidity(
            ma,
            0,
            block.timestamp + 60
        );

        emit LogAddliquidityToStableSwap(usnAmount);
    }

    function sendLpToken() public onlyEOA {
        // Check the balanceOf converted TLP and send to pTri for dishing out
        uint256 tlpAmount = IERC20(tlpToken).balanceOf(address(this));
        require(tlpAmount > 0, "StableLpMaker: no TLP to send");
        if (polPercent == 0) {
            IERC20(tlpToken).safeTransfer(pTri, tlpAmount);
            emit LogLpTokensSentTopTRI(tlpAmount);
        } else {
            uint256 daoAmount = tlpAmount.mul(polPercent).div(100);
            uint256 tlpAmount = tlpAmount.sub(daoAmount);
            IERC20(tlpToken).safeTransfer(pTri, tlpAmount);
            IERC20(tlpToken).safeTransfer(dao, daoAmount);
            emit LogLpTokensSentTopTRI(tlpAmount);
            emit LogLpTokensSentToDao(daoAmount);
        }

    }

    // Only Owner Functions
    function setpTri(address _pTri) public onlyOwner {
        address oldpTri;
        oldpTri = pTri;
        pTri = _pTri;

        emit LogSetpTri(oldpTri, _pTri);
    }

    function setDaoAddress(address _dao) public onlyOwner {
        address oldDao;
        oldDao = dao;
        dao = _dao;

        emit LogSetdao(oldDao, dao);
    }

    function setprotocolOwnerLiquidityPercent(uint256 _polPercent) public onlyOwner {
        require(_polPercent <= 100, "POL is too high");
        uint256 oldpolPercent;
        oldpolPercent = polPercent;
        polPercent = _polPercent;

        emit LogProtocolOwnedLiquidity(oldpolPercent, polPercent);
    }

    // Emergency Withdraw function
    function reclaimTokens(address token, uint256 amount, address payable to) public onlyOwner {
        if (token == address(0)) {
            to.transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // Run the whole contract
    function convertStables() external onlyEOA {
        // Withdraw admin fees from the stableswap pool to stable tokens
        withdrawStableTokenFees();

        // For each stable token, we need to convert it to usn via the stableswap
        swapStableTokensToUsn();

        // Add USN liquidity to the stable swap
        addLiquidityToStableSwap();

        // Converted stable tokens to usn get sent to LP Maker
        sendLpToken();
    }
}
