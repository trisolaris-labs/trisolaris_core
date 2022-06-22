// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract Vester {
    using SafeMath for uint256;

    address public tri;
    address public recipient;

    uint256 public vestingAmount;
    uint256 public vestingBegin;
    uint256 public vestingCliff;
    uint256 public vestingEnd;

    uint256 public lastUpdate;

    constructor(
        address tri_,
        address recipient_,
        uint256 vestingAmount_,
        uint256 vestingBegin_,
        uint256 vestingCliff_,
        uint256 vestingEnd_
    ) public {
        require(vestingBegin_ >= block.timestamp, "Vester::constructor: vesting begin too early");
        require(vestingCliff_ >= vestingBegin_, "Vester::constructor: cliff is too early");
        require(vestingEnd_ > vestingCliff_, "Vester::constructor: end is too early");

        tri = tri_;
        recipient = recipient_;

        vestingAmount = vestingAmount_;
        vestingBegin = vestingBegin_;
        vestingCliff = vestingCliff_;
        vestingEnd = vestingEnd_;

        lastUpdate = vestingBegin;
    }

    function setRecipient(address recipient_) public {
        require(msg.sender == recipient, "Vester::setRecipient: unauthorized");
        recipient = recipient_;
    }

    function claim() public {
        require(block.timestamp >= vestingCliff, "Vester::claim: not time yet");
        uint256 amount;
        if (block.timestamp >= vestingEnd) {
            amount = ITri(tri).balanceOf(address(this));
        } else {
            amount = vestingAmount.mul(block.timestamp - lastUpdate).div(vestingEnd - vestingBegin);
            lastUpdate = block.timestamp;
        }
        ITri(tri).transfer(recipient, amount);
    }
}

interface ITri {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address dst, uint256 rawAmount) external returns (bool);
}
