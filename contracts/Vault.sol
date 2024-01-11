// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";

// receiver reciever
struct QueueItem {
    address sender; // ? Should we store this?
    address receiver;
    uint256 amount; // Assets for deposits, shares for withdrawals
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

    function popFront(Queue storage queue) internal returns (QueueItem memory) {
        require(queue.last > queue.first, "Queue is empty");
        QueueItem memory item = queue.items[queue.first];
        delete queue.items[queue.first];
        queue.first += 1;
        return item;
    }
}

contract Vault is ERC20, Ownable {
    using Math for uint256;

    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    IERC20 private immutable _asset;

    uint256 public price;
    uint256 public priceUpdatedAt;
    uint256 public withdrawalFee;
    uint256 public totalDepositedAssets;
    uint256 public totalWithdrawnssets;
    VaultQueue.Queue myQueue;

    modifier onlyUpdatedPrice() {
        require(priceUpdatedAt > block.timestamp - 1 days, "Price is outdated");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 asset_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _asset = asset_;
    }

    function decimals() public view virtual override(ERC20) returns (uint8) {
        return 18;
    }

    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    function totalAssets() public view virtual returns (uint256) {
        return totalDepositedAssets - totalWithdrawnssets;
    }

    function updatePrice(uint256 newPrice) public onlyOwner {
        price = newPrice;
        priceUpdatedAt = block.timestamp;
    }

    function updateWithdrawalFee(uint256 withdrawalFee_) public onlyOwner {
        withdrawalFee = withdrawalFee_;
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

    // ? Should we rename this to something else since its not strictly a deposit
    function deposit(uint256 assets, address receiver) public virtual {
        _asset.transferFrom(_msgSender(), address(this), assets);
        _asset.transfer(owner(), assets);
        QueueItem memory item = QueueItem(
            msg.sender,
            receiver,
            assets,
            uint32(block.timestamp)
        );
        VaultQueue.pushBack(myQueue, item);
    }

    function convertToShares(
        uint256 assets
    ) public view virtual returns (uint256) {
        return assets / price;
    }

    function convertToAssets(
        uint256 shares
    ) public view virtual returns (uint256) {
        return shares * price;
    }

    function processDeposits(uint128 number) public onlyOwner onlyUpdatedPrice {
        for (uint128 i = 0; i < number; i++) {
            QueueItem memory item = VaultQueue.popFront(myQueue);
            uint256 shares = convertToAssets(item.amount);
            _mint(item.receiver, shares);
            totalDepositedAssets += item.amount;
            emit Deposit(item.sender, item.receiver, item.amount, shares);
        }
    }
}
