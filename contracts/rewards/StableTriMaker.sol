// SPDX-License-Identifier: MIT

// P1 - P3: OK
pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../amm/interfaces/IUniswapV2ERC20.sol";
import "../amm/interfaces/IUniswapV2Pair.sol";
import "../amm/interfaces/IUniswapV2Factory.sol";
import "../amm/interfaces/IUniswapV2Router02.sol";
import "../interfaces/IMetaSwap.sol";
import "hardhat/console.sol";

// StableTriMaker is MasterChef's left hand and kinda a wizard. He can cook up Tri from pretty much anything!
// This contract handles "serving up" rewards for xTri holders by trading tokens collected from fees for Tri.

// T1 - T4: OK
contract StableTriMaker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IUniswapV2Factory public immutable factory;
    IUniswapV2Router02 public immutable router;
    address public immutable bar;
    address private immutable tri;
    address private immutable weth;

    // V1 - V5: OK
    mapping(address => address) internal _bridges;

    // E1: OK
    event LogBridgeSet(address indexed token, address indexed bridge);
    // E1: OK
    event LogConvert(
        address indexed server,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 amountTRI
    );

    constructor(
        address _router,
        address _factory,
        address _bar,
        address _tri,
        address _weth
    ) public {
        router = IUniswapV2Router02(_router);
        factory = IUniswapV2Factory(_factory);
        bar = _bar;
        tri = _tri;
        weth = _weth;
    }

    // F1 - F10: OK
    // C1 - C24: OK
    function bridgeFor(address token) public view returns (address bridge) {
        bridge = _bridges[token];
        if (bridge == address(0)) {
            bridge = weth;
        }
    }

    // F1 - F10: OK
    // C1 - C24: OK
    function setBridge(address token, address bridge) external onlyOwner {
        // Checks
        require(token != tri && token != weth && token != bridge, "StableTriMaker: Invalid bridge");

        // Effects
        _bridges[token] = bridge;
        emit LogBridgeSet(token, bridge);
    }

    // M1 - M5: OK
    // C1 - C24: OK
    // C6: It's not a fool proof solution, but it prevents flash loans, so here it's ok to use tx.origin
    modifier onlyEOA() {
        // Try to make flash-loan exploit harder to do by only allowing externally owned addresses.
        require(msg.sender == tx.origin, "StableTriMaker: must use EOA");
        _;
    }

    function convertStables(
        address metaSwapDeposit,
        address metaSwapLpToken,
        address[] calldata stableTokens
    ) external onlyEOA {
        // Remove liquidity from stableswap lp into stableTokens arg
        // Calls convert() on each stableToken
        uint256 stableTokensBalance = IERC20(metaSwapLpToken).balanceOf(address(this));
        IERC20(metaSwapLpToken).approve(metaSwapDeposit, stableTokensBalance);
        uint256[] memory minAmounts = IMetaSwap(metaSwapDeposit).calculateRemoveLiquidity(stableTokensBalance);
        IMetaSwap(metaSwapDeposit).removeLiquidity(stableTokensBalance, minAmounts, block.timestamp + 5 minutes);

        IERC20(stableTokens[0]).approve(address(router), stableTokensBalance);
        IERC20(stableTokens[1]).approve(address(router), stableTokensBalance);
        router.addLiquidity(
            stableTokens[0],
            stableTokens[1],
            IERC20(stableTokens[0]).balanceOf(address(this)),
            IERC20(stableTokens[1]).balanceOf(address(this)),
            0,
            0,
            address(this),
            block.timestamp + 5 minutes
        );

        // Convert
        _convert(stableTokens[0], stableTokens[1]);
    }

    // F1 - F10: OK
    // F3: _convert is separate to save gas by only checking the 'onlyEOA' modifier once in case of convertMultiple
    // F6: There is an exploit to add lots of TRI to the bar, run convert, then remove the TRI again.
    //     As the size of the TriBar has grown, this requires large amounts of funds and isn't super profitable anymore
    //     The onlyEOA modifier prevents this being done with a flash loan.
    // C1 - C24: OK
    function convert(address token0, address token1) external onlyEOA {
        _convert(token0, token1);
    }

    // F1 - F10: OK, see convert
    // C1 - C24: OK
    // C3: Loop is under control of the caller
    function convertMultiple(address[] calldata token0, address[] calldata token1) external onlyEOA {
        // TODO: This can be optimized a fair bit, but this is safer and simpler for now
        uint256 len = token0.length;
        for (uint256 i = 0; i < len; i++) {
            _convert(token0[i], token1[i]);
        }
    }

    // F1 - F10: OK
    // C1- C24: OK
    function _convert(address token0, address token1) internal {
        // Interactions
        // S1 - S4: OK
        IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(token0, token1));
        require(address(pair) != address(0), "StableTriMaker: Invalid pair");
        // balanceOf: S1 - S4: OK
        // transfer: X1 - X5: OK
        IERC20(address(pair)).safeTransfer(address(pair), pair.balanceOf(address(this)));
        // X1 - X5: OK
        (uint256 amount0, uint256 amount1) = pair.burn(address(this));
        if (token0 != pair.token0()) {
            (amount0, amount1) = (amount1, amount0);
        }
        emit LogConvert(msg.sender, token0, token1, amount0, amount1, _convertStep(token0, token1, amount0, amount1));
    }

    // F1 - F10: OK
    // C1 - C24: OK
    // All safeTransfer, _swap, _toTRI, _convertStep: X1 - X5: OK
    function _convertStep(
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1
    ) internal returns (uint256 triOut) {
        // Interactions
        if (token0 == token1) {
            uint256 amount = amount0.add(amount1);
            if (token0 == tri) {
                IERC20(tri).safeTransfer(bar, amount);
                triOut = amount;
            } else if (token0 == weth) {
                triOut = _toTRI(weth, amount);
            } else {
                address bridge = bridgeFor(token0);
                amount = _swap(token0, bridge, amount, address(this));
                triOut = _convertStep(bridge, bridge, amount, 0);
            }
        } else if (token0 == tri) {
            // eg. TRI - ETH
            IERC20(tri).safeTransfer(bar, amount0);
            triOut = _toTRI(token1, amount1).add(amount0);
        } else if (token1 == tri) {
            // eg. USDT - TRI
            IERC20(tri).safeTransfer(bar, amount1);
            triOut = _toTRI(token0, amount0).add(amount1);
        } else if (token0 == weth) {
            // eg. ETH - USDC
            triOut = _toTRI(weth, _swap(token1, weth, amount1, address(this)).add(amount0));
        } else if (token1 == weth) {
            // eg. USDT - ETH
            triOut = _toTRI(weth, _swap(token0, weth, amount0, address(this)).add(amount1));
        } else {
            // eg. MIC - USDT
            address bridge0 = bridgeFor(token0);
            address bridge1 = bridgeFor(token1);
            if (bridge0 == token1) {
                // eg. MIC - USDT - and bridgeFor(MIC) = USDT
                triOut = _convertStep(bridge0, token1, _swap(token0, bridge0, amount0, address(this)), amount1);
            } else if (bridge1 == token0) {
                // eg. WBTC - DSD - and bridgeFor(DSD) = WBTC
                triOut = _convertStep(token0, bridge1, amount0, _swap(token1, bridge1, amount1, address(this)));
            } else {
                triOut = _convertStep(
                    bridge0,
                    bridge1, // eg. USDT - DSD - and bridgeFor(DSD) = WBTC
                    _swap(token0, bridge0, amount0, address(this)),
                    _swap(token1, bridge1, amount1, address(this))
                );
            }
        }
    }

    // F1 - F10: OK
    // C1 - C24: OK
    // All safeTransfer, swap: X1 - X5: OK
    function _swap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        address to
    ) internal returns (uint256 amountOut) {
        // Checks
        // X1 - X5: OK
        IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(fromToken, toToken));
        require(address(pair) != address(0), "StableTriMaker: Cannot convert");

        // Interactions
        // X1 - X5: OK
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        uint256 amountInWithFee = amountIn.mul(997);
        if (fromToken == pair.token0()) {
            amountOut = amountInWithFee.mul(reserve1) / reserve0.mul(1000).add(amountInWithFee);
            IERC20(fromToken).safeTransfer(address(pair), amountIn);
            pair.swap(0, amountOut, to, new bytes(0));
            // TODO: Add maximum slippage?
        } else {
            amountOut = amountInWithFee.mul(reserve0) / reserve1.mul(1000).add(amountInWithFee);
            IERC20(fromToken).safeTransfer(address(pair), amountIn);
            pair.swap(amountOut, 0, to, new bytes(0));
            // TODO: Add maximum slippage?
        }
    }

    // F1 - F10: OK
    // C1 - C24: OK
    function _toTRI(address token, uint256 amountIn) internal returns (uint256 amountOut) {
        // X1 - X5: OK
        amountOut = _swap(token, tri, amountIn, bar);
    }
}
