// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is ERC20 {
    constructor() ERC20("ERC20Token", "ERT") {
        _mint(msg.sender, 10 ** 9 * 10 ** 18);
    }
}
