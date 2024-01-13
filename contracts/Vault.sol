// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DoubleEndedQueue} from "./libraries/DoubleEndedQueue.sol";

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

    event PriceUpdate(uint256 price);

    struct DepositItem {
        address sender;
        address receiver;
        uint256 assets;
        uint32 timestamp;
    }

    struct RedeemItem {
        address caller;
        address owner;
        address receiver;
        uint256 shares;
        uint32 timestamp;
    }

    IERC20 private immutable _asset;

    uint256 public price;
    uint256 public priceUpdatedAt;
    uint256 public withdrawalFee;
    uint256 public totalAssetsDeposited;
    uint256 public totalAssetsWithdrawn;
    DoubleEndedQueue.BytesDeque private _depositQueue;
    DoubleEndedQueue.BytesDeque private _redeemQueue;

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

    function convertToShares(
        uint256 assets
    ) public view virtual returns (uint256) {
        // TODO:- Check rounding
        return assets / price;
    }

    function convertToAssets(
        uint256 shares
    ) public view virtual returns (uint256) {
        // TODO:- Check rounding
        return shares * price;
    }

    function totalAssets() public view virtual returns (uint256) {
        // TODO: ! This is wrong - it can become negative
        return totalAssetsDeposited - totalAssetsWithdrawn;
    }

    function maxDeposit(address) public view virtual returns (uint256) {
        return type(uint256).max; // No limit
    }

    /** @dev See {IERC4626-maxRedeem}. */
    // Owner is the owner of the shares 4626 terminalogy
    function maxRedeem(address owner_) public view virtual returns (uint256) {
        return balanceOf(owner_);
    }

    function updatePrice(uint256 newPrice) public onlyOwner {
        price = newPrice;
        priceUpdatedAt = block.timestamp;
        emit PriceUpdate(newPrice);
    }

    function updateWithdrawalFee(uint256 withdrawalFee_) public onlyOwner {
        withdrawalFee = withdrawalFee_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function pendingDeposits() public view returns (DepositItem[] memory) {
        uint256 len = DoubleEndedQueue.length(_depositQueue);
        DepositItem[] memory queueItems = new DepositItem[](len);
        for (uint256 i = 0; i < len; i++) {
            queueItems[i] = abi.decode(
                DoubleEndedQueue.at(_depositQueue, i),
                (DepositItem)
            );
        }
        return queueItems;
    }

    function pendingRedeems() public view returns (RedeemItem[] memory) {
        uint256 len = DoubleEndedQueue.length(_redeemQueue);
        RedeemItem[] memory queueItems = new RedeemItem[](len);
        for (uint128 i = 0; i < len; i++) {
            queueItems[i] = abi.decode(
                DoubleEndedQueue.at(_redeemQueue, i),
                (RedeemItem)
            );
        }
        return queueItems;
    }

    function deposit(
        uint256 assets,
        address receiver
    ) public virtual whenNotPaused {
        _asset.safeTransferFrom(_msgSender(), address(this), assets);
        _asset.safeTransfer(owner(), assets);

        DepositItem memory item = DepositItem(
            _msgSender(),
            receiver,
            assets,
            uint32(block.timestamp)
        );
        DoubleEndedQueue.pushBack(_depositQueue, abi.encode(item));
    }

    function processDeposits(uint128 number) public onlyOwner onlyUpdatedPrice {
        uint256 total = 0; // Local variable for gas optimization
        for (uint128 i = 0; i < number; i++) {
            DepositItem memory item = abi.decode(
                DoubleEndedQueue.popFront(_depositQueue),
                (DepositItem)
            );
            uint256 shares = convertToAssets(item.assets);
            _mint(item.receiver, shares);
            total += item.assets;
            emit Deposit(item.sender, item.receiver, item.assets, shares);
        }
        totalAssetsDeposited += total;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    ) public virtual whenNotPaused {
        uint256 maxShares = maxRedeem(owner_);
        if (shares > maxShares) {
            revert ERC4626ExceededMaxRedeem(owner_, shares, maxShares);
        }
        // Transfer to contract first,
        _transfer(_msgSender(), address(this), shares);

        // Add to queue
        RedeemItem memory item = RedeemItem(
            _msgSender(),
            owner_,
            receiver,
            shares,
            uint32(block.timestamp)
        );
        DoubleEndedQueue.pushBack(_redeemQueue, abi.encode(item));
    }

    function processRedeems(
        uint128 number,
        uint256 total
    ) public onlyOwner onlyUpdatedPrice {
        _asset.safeTransferFrom(_msgSender(), address(this), total);

        for (uint256 i = 0; i < number; i++) {
            RedeemItem memory item = abi.decode(
                DoubleEndedQueue.popFront(_redeemQueue),
                (RedeemItem)
            );
            uint256 assets = convertToShares(item.shares);
            // TODO:- Add withdrawal fee
            _burn(address(this), item.shares);
            _asset.safeTransfer(item.receiver, assets);
            emit Withdraw(
                item.caller,
                item.receiver,
                item.owner,
                assets,
                item.shares
            );
        }

        require(_asset.balanceOf(address(this)) == 0, "Incorrect amount given");
        totalAssetsWithdrawn += total;
    }

    /// @dev ETH can't be recieve as the contract has no fallback function
    function withdrawalToOwner(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "Contract has no balance");
        require(token.transfer(owner(), balance), "Transfer failed");
    }
}
