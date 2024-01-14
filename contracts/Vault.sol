// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DoubleEndedQueue} from "./libraries/DoubleEndedQueue.sol";

contract Vault is ERC20, Ownable, Pausable {
    IERC20 private immutable _asset;

    uint256 public price;
    uint256 public priceUpdatedAt;
    uint256 public withdrawalFee;
    uint256 public totalAssetsDeposited;
    uint256 public totalAssetsWithdrawn;

    DoubleEndedQueue.BytesDeque private _depositQueue;
    DoubleEndedQueue.BytesDeque private _redeemQueue;

    // events
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

    // Function modifiers
    modifier onlyUpdatedPrice() {
        require(priceUpdatedAt > block.timestamp - 1 days, "Price is outdated");
        _;
    }

    // Structs, arrays, or enums
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

    // Errors
    /**
     * @dev Attempted to redeem more shares than the max amount for `receiver`.
     */
    error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max);

    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 asset_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _asset = asset_;
    }

    // External User Functions
    function deposit(
        uint256 assets,
        address receiver
    ) external virtual whenNotPaused {
        SafeERC20.safeTransferFrom(_asset, _msgSender(), address(this), assets);
        SafeERC20.safeTransfer(_asset, owner(), assets);

        DepositItem memory item = DepositItem(
            _msgSender(),
            receiver,
            assets,
            uint32(block.timestamp)
        );
        DoubleEndedQueue.pushBack(_depositQueue, abi.encode(item));
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    ) external virtual whenNotPaused {
        uint256 maxShares = maxRedeem(owner_);
        if (shares > maxShares) {
            revert ERC4626ExceededMaxRedeem(owner_, shares, maxShares);
        }

        // Hold the shares in the contract, and burn them later when processed
        // This blocks users from transfering shares while in the queue
        _transfer(_msgSender(), address(this), shares);

        RedeemItem memory item = RedeemItem(
            _msgSender(),
            owner_,
            receiver,
            shares,
            uint32(block.timestamp)
        );
        DoubleEndedQueue.pushBack(_redeemQueue, abi.encode(item));
    }

    // External owner functions
    function updatePrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
        priceUpdatedAt = block.timestamp;
        emit PriceUpdate(newPrice);
    }

    function updateWithdrawalFee(uint256 withdrawalFee_) external onlyOwner {
        withdrawalFee = withdrawalFee_;
    }

    function processDeposits(
        uint128 number
    ) external onlyOwner onlyUpdatedPrice {
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

    function processRedeems(
        uint128 number,
        uint256 total
    ) external onlyOwner onlyUpdatedPrice {
        SafeERC20.safeTransferFrom(_asset, _msgSender(), address(this), total);

        for (uint256 i = 0; i < number; i++) {
            RedeemItem memory item = abi.decode(
                DoubleEndedQueue.popFront(_redeemQueue),
                (RedeemItem)
            );
            uint256 assets = convertToShares(item.shares);
            uint256 fee = Math.mulDiv(
                assets,
                withdrawalFee,
                10 ** 6,
                Math.Rounding.Floor // ? Confirm with team if this is appropriate
            );
            assets = assets - fee;

            // Burn the shares locked in the contract pending redeem
            _burn(address(this), item.shares);
            SafeERC20.safeTransfer(_asset, item.receiver, assets);
            emit Withdraw(
                item.caller,
                item.receiver,
                item.owner,
                assets,
                item.shares
            );
        }

        // Expect all the assets to be spent
        require(_asset.balanceOf(address(this)) == 0, "Incorrect amount given");
        totalAssetsWithdrawn += total;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev ETH can't be recieve as the contract has no fallback function
    function withdrawalToOwner(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "Contract has no balance");
        require(token.transfer(owner(), balance), "Transfer failed");
    }

    // External view functions
    function pendingDeposits() external view returns (DepositItem[] memory) {
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

    function pendingRedeems() external view returns (RedeemItem[] memory) {
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

    // ============== Public Functions
    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    function convertToAssets(
        uint256 shares
    ) public view virtual returns (uint256) {
        return shares * price;
    }

    function convertToShares(
        uint256 assets
    ) public view virtual returns (uint256) {
        return assets / price;
    }

    function decimals() public view virtual override(ERC20) returns (uint8) {
        return 18;
    }

    function maxDeposit(address) public view virtual returns (uint256) {
        return type(uint256).max; // No limit
    }

    /** @dev See {IERC4626-maxRedeem}. */
    // Owner is the owner of the shares 4626 terminalogy
    function maxRedeem(address owner_) public view virtual returns (uint256) {
        return balanceOf(owner_);
    }

    // TODO: ! This is wrong - it can become negative -- think we cannot track on-chain?
    function totalAssets() public view virtual returns (uint256) {
        return totalAssetsDeposited - totalAssetsWithdrawn;
    }
}
