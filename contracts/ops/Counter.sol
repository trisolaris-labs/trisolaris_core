// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Counter is Ownable {

    int public count = 0;
    function incrementCounter() public onlyOwner {
        count += 1;
    }
    
    function decrementCounter() public onlyOwner {
        count -= 1;
    }

}