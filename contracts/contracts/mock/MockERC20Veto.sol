// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// MockERC20 whose transfers to a blocked address always fail (for atomicity tests).
contract MockERC20Veto is MockERC20 {
    mapping(address => bool) public blocked;

    constructor(uint8 _decimals) MockERC20(_decimals) {}

    function blockAddress(address who) external {
        blocked[who] = true;
    }

    function _transfer(address from, address to, uint256 amount) internal override returns (bool) {
        require(!blocked[to], "veto: blocked recipient");
        return super._transfer(from, to, amount);
    }
}