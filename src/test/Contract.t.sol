// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "ds-test/test.sol";
import "forge-std/stdlib.sol";
import "forge-std/Vm.sol";
import "forge-std/console.sol";

// A complex storage contract
contract Storage {
    struct UnpackedStruct {
        uint256 a;
        uint256 b;
    }

    constructor() {
        map_addr[msg.sender] = 1;
    }

    uint256 public exists = 1;
    mapping(address => uint256) public map_addr;
    mapping(address => UnpackedStruct) public map_struct;
    mapping(address => mapping(address => uint256)) public deep_map;
    mapping(address => mapping(address => UnpackedStruct)) public deep_map_struct;
    UnpackedStruct public basicStruct = UnpackedStruct({ a: 1, b: 2 });

    function hidden() public view returns (bytes32 t) {
        // an extremely hidden storage slot
        bytes32 slot = keccak256("my.random.var");
        assembly {
            t := sload(slot)
        }
    }
}

contract TestContract is DSTest {
    using stdStorage for StdStorage;

    Vm public constant vm = Vm(HEVM_ADDRESS);

    Storage test;
    StdStorage stdstore;

    function setUp() public {
        console.log(1);
        test = new Storage();
    }

    function testExample() public {
        assertTrue(true);
    }

    function testFindExists() public {
        // Lets say we want to find the slot for the public
        // variable `exists`. We just pass in the function selector
        // to the `find` command
        uint256 slot = stdstore.target(address(test)).sig("exists()").find();
        assertEq(slot, 0);
    }

    function testWriteExists() public {
        // Lets say we want to write to the slot for the public
        // variable `exists`. We just pass in the function selector
        // to the `checked_write` command
        stdstore.target(address(test)).sig("exists()").checked_write(100);
        assertEq(test.exists(), 100);
    }
}
