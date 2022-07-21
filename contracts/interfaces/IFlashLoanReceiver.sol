// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.6.12;

/**
 * @title IFlashLoanReceiver interface
 * @notice Interface for the Saddle fee IFlashLoanReceiver. Modified from Aave's IFlashLoanReceiver interface.
 * @author Aave
 * @dev implement this interface to develop a flashloan-compatible flashLoanReceiver contract
 **/
interface IFlashLoanReceiver {
    function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external;
}
