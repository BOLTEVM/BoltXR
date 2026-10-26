// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IcedOutXRWatches} from "../../src/IcedOutXRWatches.sol";

/// @dev IERC721Receiver.onERC721Received.selector
bytes4 constant ERC721_RECEIVED = 0x150b7a02;

/// @dev Stands in for an ERC-20 or ERC-721 pass: only `balanceOf(address)` matters.
contract MockBalancePass {
    mapping(address => uint256) public balanceOf;

    function give(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function clear(address from) external {
        balanceOf[from] = 0;
    }
}

/// @dev Stands in for an ERC-1155 pass.
contract MockPass1155 {
    mapping(address => mapping(uint256 => uint256)) private _balances;

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balances[account][id];
    }

    function give(address to, uint256 id, uint256 amount) external {
        _balances[to][id] += amount;
    }
}

/// @dev A broken pass contract.
contract RevertingPass {
    function balanceOf(address) external pure returns (uint256) {
        revert("broken pass");
    }
}

/// @dev Tries to mint again from inside onERC721Received.
contract ReentrantMinter {
    IcedOutXRWatches private immutable _watches;
    bool public reentryBlocked;
    bool public reentered;
    bytes4 public reentryError;

    constructor(IcedOutXRWatches watches) {
        _watches = watches;
    }

    function attack() external payable {
        _watches.mint{value: msg.value}(1);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        try _watches.mint{value: 0.1 ether}(1) {
            reentered = true;
        } catch (bytes memory reason) {
            reentryBlocked = true;
            reentryError = bytes4(reason);
        }
        return ERC721_RECEIVED;
    }

    receive() external payable {}
}

/// @dev Accepts the NFT but cannot take a refund.
contract NoRefundMinter {
    IcedOutXRWatches private immutable _watches;

    constructor(IcedOutXRWatches watches) {
        _watches = watches;
    }

    function mintPaying(uint256 quantity) external payable {
        _watches.mint{value: msg.value}(quantity);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return ERC721_RECEIVED;
    }
}

/// @dev Has no onERC721Received, so `_safeMint` must refuse it.
contract NotAReceiver {
    function mintPaying(IcedOutXRWatches watches, uint256 quantity) external payable {
        watches.mint{value: msg.value}(quantity);
    }
}

/// @dev A withdrawal target that refuses ETH.
contract RejectsEther {
    receive() external payable {
        revert("no thanks");
    }
}

/// @dev Records what the collection looks like from inside the first receiver hook of a batch.
contract BatchObserver {
    IcedOutXRWatches private immutable _watches;
    uint256 public hooks;
    uint256 public balanceAtFirstHook;
    uint256 public supplyAtFirstHook;
    address public lastOwnerAtFirstHook;

    constructor(IcedOutXRWatches watches) {
        _watches = watches;
    }

    function mintPaying(uint256 quantity) external payable {
        _watches.mint{value: msg.value}(quantity);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (hooks++ == 0) {
            balanceAtFirstHook = _watches.balanceOf(address(this));
            supplyAtFirstHook = _watches.totalSupply();
            lastOwnerAtFirstHook = _watches.ownerOf(supplyAtFirstHook);
        }
        return ERC721_RECEIVED;
    }
}
