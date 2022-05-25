// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IMasterChefV2 {
    function deposit(uint256 _pid, uint256 _amount, address to) external;
}