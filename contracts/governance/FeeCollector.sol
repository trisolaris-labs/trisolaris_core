// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FeeCollector is AccessControl {
    // Define a role identifier for fee managers.
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    // Events to log withdrawals.
    event ETHWithdrawn(address indexed recipient, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    /**
     * @dev Constructor sets the deployer as the admin and grants FEE_MANAGER_ROLE to three initial addresses.
     * @param feeManagers An array containing exactly three fee manager addresses.
     */
    constructor(address[] memory feeManagers) public {
        require(feeManagers.length > 0, "At least 1 fee manager required");

        // Grant the deployer the default admin role.
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Assign the FEE_MANAGER_ROLE to each provided address.
        for (uint256 i = 0; i < feeManagers.length; i++) {
            _setupRole(FEE_MANAGER_ROLE, feeManagers[i]);
        }
    }

    /**
     * @dev Withdraw ETH from the contract. Only an account with the FEE_MANAGER_ROLE can call this.
     * @param recipient The address to which the ETH should be sent.
     * @param amount The amount of ETH to withdraw.
     */
    function withdrawETH(address payable recipient, uint256 amount) external {
        require(hasRole(FEE_MANAGER_ROLE, msg.sender), "Caller is not a fee manager");
        require(address(this).balance >= amount, "Insufficient ETH balance");

        (bool success, ) = recipient.call{ value: amount }("");
        require(success, "ETH transfer failed");
        emit ETHWithdrawn(recipient, amount);
    }

    /**
     * @dev Withdraw ERC20 tokens from the contract. Only an account with the FEE_MANAGER_ROLE can call this.
     * @param token The address of the ERC20 token.
     * @param recipient The address to which the tokens should be sent.
     * @param amount The amount of tokens to withdraw.
     */
    function withdrawToken(
        address token,
        address recipient,
        uint256 amount
    ) external {
        require(hasRole(FEE_MANAGER_ROLE, msg.sender), "Caller is not a fee manager");
        IERC20 erc20 = IERC20(token);
        require(erc20.balanceOf(address(this)) >= amount, "Insufficient token balance");
        require(erc20.transfer(recipient, amount), "Token transfer failed");
        emit TokenWithdrawn(token, recipient, amount);
    }

    /**
     * @dev Fallback function to accept ETH.
     */
    receive() external payable {}
}
