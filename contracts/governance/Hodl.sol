// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

/**
 * This is a sample contract to be used in the MasterChef contract for partners to reward
 * stakers with their native token alongside TRI.
 *
 * It assumes the project already has an existing MasterChef-style farm contract.
 * The contract then transfers the reward token to the user on each call to
 * onTriReward().
 *
 */
contract Hodl is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // The timestamp when hodl ends.
    uint256 public hodlEnd;

    constructor(uint256 _hodlEnd) public {
        require(_hodlEnd >= block.timestamp, "Hodl::constructor: hodl end too early");
        hodlEnd = _hodlEnd;
    }

    // keep all the ether sent to this address
    receive() external payable {}

    // @notice Allows owner to reclaim/withdraw any tokens (including reward tokens) held by this contract
    /// @param token Token to reclaim, use 0x00 for Ethereum
    /// @param amount Amount of tokens to reclaim
    /// @param to Receiver of the tokens
    function reclaimTokens(
        address token,
        uint256 amount,
        address payable to
    ) public onlyOwner {
        require(hodlEnd <= block.timestamp, "Hodl:: reclaimTokens: not time yet");
        if (token == address(0)) {
            to.transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
