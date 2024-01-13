// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";

// track number of shares and number of assets?

struct DepositItem {
    address sender; // ? Should we store this?
    address receiver;
    uint256 amount; // Assets for deposits, shares for withdrawals
    uint32 timestamp;
}

struct RedeemItem {
    address caller;
    address owner;
    address receiver;
    uint256 shares;
    uint32 timestamp;
}

library DepositQueue {
    struct Queue {
        uint128 first;
        uint128 last;
        mapping(uint128 => DepositItem) items;
    }

    function initialize(Queue storage queue) internal {
        queue.first = 1;
        queue.last = 1;
    }

    function pushBack(Queue storage queue, DepositItem memory item) internal {
        queue.items[queue.last] = item;
        queue.last += 1;
    }

    function popFront(
        Queue storage queue
    ) internal returns (DepositItem memory) {
        require(queue.last > queue.first, "Queue is empty");
        DepositItem memory item = queue.items[queue.first];
        delete queue.items[queue.first];
        queue.first += 1;
        return item;
    }
}

library RedeemQueue {
    struct Queue {
        uint128 first;
        uint128 last;
        mapping(uint128 => RedeemItem) items;
    }

    function initialize(Queue storage queue) internal {
        queue.first = 1;
        queue.last = 1;
    }

    function pushBack(Queue storage queue, RedeemItem memory item) internal {
        queue.items[queue.last] = item;
        queue.last += 1;
    }

    function popFront(
        Queue storage queue
    ) internal returns (RedeemItem memory) {
        require(queue.last > queue.first, "Queue is empty");
        RedeemItem memory item = queue.items[queue.first];
        delete queue.items[queue.first];
        queue.first += 1;
        return item;
    }
}

// Remove from queue
contract Vault is ERC20, Ownable, Pausable {
    using Math for uint256;
    using SafeERC20 for IERC20;

    /**
     * @dev Attempted to redeem more shares than the max amount for `receiver`.
     */
    error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max);

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
    uint256 public totalWithdrawnAssets;
    DepositQueue.Queue myQueue;
    RedeemQueue.Queue withdrawalQueue;

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
        return totalDepositedAssets - totalWithdrawnAssets;
    }

    function updatePrice(uint256 newPrice) public onlyOwner {
        price = newPrice;
        priceUpdatedAt = block.timestamp;
    }

    function updateWithdrawalFee(uint256 withdrawalFee_) public onlyOwner {
        withdrawalFee = withdrawalFee_;
    }

    function depositQueue() public view returns (DepositItem[] memory) {
        DepositItem[] memory queueItems = new DepositItem[](
            myQueue.last - myQueue.first
        );
        for (uint128 i = myQueue.first; i < myQueue.last; i++) {
            queueItems[i - myQueue.first] = myQueue.items[i];
        }
        return queueItems;
    }

    function redeemQueue() public view returns (RedeemItem[] memory) {
        RedeemItem[] memory queueItems = new RedeemItem[](
            withdrawalQueue.last - withdrawalQueue.first
        );
        for (uint128 i = withdrawalQueue.first; i < withdrawalQueue.last; i++) {
            queueItems[i - withdrawalQueue.first] = withdrawalQueue.items[i];
        }
        return queueItems;
    }

    // ? Should we rename this to something else since its not strictly a deposit
    function deposit(
        uint256 assets,
        address receiver
    ) public virtual whenNotPaused {
        _asset.safeTransferFrom(_msgSender(), address(this), assets);
        _asset.safeTransfer(owner(), assets);
        DepositItem memory item = DepositItem(
            msg.sender,
            receiver,
            assets,
            uint32(block.timestamp)
        );
        DepositQueue.pushBack(myQueue, item);
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
            DepositItem memory item = DepositQueue.popFront(myQueue);
            uint256 shares = convertToAssets(item.amount);
            _mint(item.receiver, shares);
            totalDepositedAssets += item.amount;
            emit Deposit(item.sender, item.receiver, item.amount, shares);
        }
    }

    /** @dev See {IERC4626-maxRedeem}. */
    // Owner is the owner of the shares 4626 terminalogy
    function maxRedeem(address owner) public view virtual returns (uint256) {
        return balanceOf(owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual whenNotPaused {
        uint256 maxShares = maxRedeem(owner);
        if (shares > maxShares) {
            revert ERC4626ExceededMaxRedeem(owner, shares, maxShares);
        }
        // Transfer to contract first,
        _transfer(_msgSender(), address(this), shares);

        // Add to queue
        RedeemItem memory item = RedeemItem(
            _msgSender(),
            owner,
            receiver,
            shares,
            uint32(block.timestamp)
        );
        RedeemQueue.pushBack(withdrawalQueue, item);
    }

    function processRedeems(
        uint128 number,
        uint256 amount
    ) public onlyOwner onlyUpdatedPrice {
        _asset.safeTransferFrom(owner(), address(this), amount);

        for (uint128 i = 0; i < number; i++) {
            RedeemItem memory item = RedeemQueue.popFront(withdrawalQueue);
            uint256 assets = convertToShares(item.shares);
            _burn(address(this), item.shares);
            _asset.safeTransfer(item.receiver, assets);
            totalWithdrawnAssets += assets; // ? # shares and # assets not in sync
            emit Withdraw(
                item.caller,
                item.receiver,
                item.owner,
                assets,
                item.shares
            );
        }

        require(_asset.balanceOf(address(this)) == 0, "Incorrect amount given");
    }

    /// @dev ETH can't be recieve as the contract has no fallback function
    function withdrawalToOwner(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "Contract has no balance");
        require(token.transfer(owner(), balance), "Transfer failed");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
