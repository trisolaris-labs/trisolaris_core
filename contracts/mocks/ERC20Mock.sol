// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 supply
    ) public ERC20(name, symbol) {
        _setupDecimals(decimals);
        _mint(msg.sender, supply);
    }

    function burn(address account, uint256 amount) public virtual {
        _burn(account, amount);
    }
}
