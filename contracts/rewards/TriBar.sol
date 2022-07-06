// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// TriBar is the coolest bar in town. You come in with some Tri, and leave with more!
// The longer you stay, the more Tri you get.
//
// This contract handles swapping to and from xTri, TriSwap's staking token.
contract TriBar is ERC20("TriBar", "xTRI") {
    using SafeMath for uint256;
    IERC20 public tri;

    // Define the Tri token contract
    constructor(IERC20 _tri) public {
        tri = _tri;
    }

    // Enter the bar. Pay some TRIs. Earn some shares.
    // Locks Tri and mints xTri
    function enter(uint256 _triAmount) public {
        // Gets the amount of Tri locked in the contract
        uint256 totalTri = tri.balanceOf(address(this));
        // Gets the amount of xTri in existence
        uint256 totalShares = totalSupply();
        // If no xTri exists, mint it 1:1 to the amount put in
        if (totalShares == 0 || totalTri == 0) {
            _mint(msg.sender, _triAmount);
        }
        // Calculate and mint the amount of xTri the Tri is worth.
        // The ratio will change overtime, as xTri is burned/minted and
        // Tri deposited + gained from fees / withdrawn.
        else {
            uint256 xTriAmount = _triAmount.mul(totalShares).div(totalTri);
            _mint(msg.sender, xTriAmount);
        }
        // Lock the Tri in the contract
        tri.transferFrom(msg.sender, address(this), _triAmount);
    }

    // Leave the bar. Claim back your TRIs.
    // Unlocks the staked + gained Tri and burns xTri
    function leave(uint256 xTriAmount) public {
        // Gets the amount of Tri locked in the contract
        uint256 totalTri = tri.balanceOf(address(this));
        // Gets the amount of xTri in existence
        uint256 totalShares = totalSupply();
        // Calculates the amount of Tri the xTri is worth
        uint256 triAmount = xTriAmount.mul(totalTri).div(totalShares);
        _burn(msg.sender, xTriAmount);
        tri.transfer(msg.sender, triAmount);
    }
}
