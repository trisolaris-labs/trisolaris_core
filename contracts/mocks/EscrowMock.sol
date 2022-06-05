// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EscrowMock is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 supply
    ) public ERC20(name, symbol) {
        _setupDecimals(decimals);
        _mint(msg.sender, supply);
    }

    function deposit(
        address account,
        address token,
        uint256 amount
    ) public virtual {
        ERC20(token).transferFrom(account, address(this), amount);
        _mint(account, amount);
    }

    function withdraw(
        address account,
        address token,
        uint256 amount
    ) public virtual {
        ERC20(token).transfer(account, amount);
        _burn(account, amount);
    }
}
