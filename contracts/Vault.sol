// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";

struct QueueItem {
    address sender; // ? Should we store this?
    address reciever;
    uint256 assets;
    uint32 timestamp;
}

library VaultQueue {
    struct Queue {
        uint128 first;
        uint128 last;
        mapping(uint128 => QueueItem) items;
    }

    function initialize(Queue storage queue) internal {
        queue.first = 1;
        queue.last = 1;
    }

    function pushBack(Queue storage queue, QueueItem memory item) internal {
        queue.items[queue.last] = item;
        queue.last += 1;
    }
}

contract Vault is ERC20, Ownable {
    IERC20 private immutable _asset;

    VaultQueue.Queue myQueue;

    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 asset_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _asset = asset_;
    }

    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    // ? Should we rename this to something else since its not strictly a deposit
    function deposit(uint256 assets, address receiver) public virtual {
        // _asset.transferFrom(_msgSender(), address(this), assets);
        // _asset.transferFrom(address(this), owner(), assets);
        QueueItem memory item = QueueItem(
            msg.sender,
            receiver,
            assets,
            uint32(block.timestamp)
        );
        VaultQueue.pushBack(myQueue, item);
    }

    function depositQueue() public view returns (QueueItem[] memory) {
        QueueItem[] memory queueItems = new QueueItem[](
            myQueue.last - myQueue.first
        );
        for (uint128 i = myQueue.first; i < myQueue.last; i++) {
            queueItems[i - myQueue.first] = myQueue.items[i];
        }
        return queueItems;
    }
}
