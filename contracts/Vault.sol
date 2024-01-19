// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {DoubleEndedQueue} from "./libraries/DoubleEndedQueue.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title Vault based on a subset of ERC-4626
 * @notice This contract represents a vault that allows users to deposit and redeem assets at any time.
 *         However, these actions are queued and processed by the owner at a later date.
 *         The conversion of assets to shares and vice versa is based on the price at the time of processing,
 *         which can be updated by the owner at any time.
 *
 *         The expected user journey is as follows:
 *         1. Users deposit assets into the vault using the `deposit` function.
 *         2. The owner processes the deposit, minting shares to the user using the `processDeposits` function.
 *         3. Users can redeem their shares for assets using the `redeem` function.
 *         4. The owner processes the redeem, sending the assets to the user and burning the shares using the `processRedeems` function.
 *
 * @dev This contract implements a subset of the OpenZeppelin ERC-4626 standard, and the functions are referenced accordingly.
 * @custom:security-contact security@bolti.io
 */
contract Vault is
    Initializable,
    ERC20Upgradeable,
    ERC20PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public constant PRICE_DECIMALS = 18;
    uint256 public constant FEE_DECIMALS = 6;

    /// @notice Underlying asset contract of the vault
    /// @dev See {IERC4626-asset}.
    IERC20 private _asset;

    /// @notice Timestamp of when the contract was created
    uint32 private _createdAt;

    /// @notice Decimals of the Vault LP Token
    /// @dev Set to decimals of the asset if the asset is ERC20, otherwise 18. See {IERC4626-decimals}.
    uint8 private _decimals;

    /// @notice Timestamp of when the price was last updated
    /// @dev Used to determine if the price is outdated when processing deposits and redeems
    uint32 public priceUpdatedAt;

    // @dev Price of the vault in 10**18 decimals
    uint256 public price;

    /// @dev 10**6 would be 100%
    uint256 public withdrawalFee;

    /// @dev Modified openzepplin DoubleEndedQueue to support bytes
    DoubleEndedQueue.BytesDeque private _depositQueue;
    DoubleEndedQueue.BytesDeque private _redeemQueue;

    // ========== Events
    /// @dev Emited when queued deposit is processed. See {IERC4626}.
    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    /// @dev Emited when queued redeem is processed. See {IERC4626}.
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    /// @dev Emited when price is udpated
    event PriceUpdate(uint256 price);

    /// @dev Emited when withdrawal fee is udpated
    event WithdrawalFeeUpdate(uint256 withdrawalFee);

    // ========== Function Modifiers
    modifier onlyUpdatedPrice() {
        require(priceUpdatedAt > block.timestamp - 1 days, "Price is outdated");
        _;
    }

    // ========== Structs, arrays, or enums
    struct PendingDeposit {
        address sender;
        address receiver;
        uint256 assets;
        uint32 timestamp;
    }
    struct PendingRedeem {
        address caller;
        address owner;
        address receiver;
        uint256 shares;
        uint32 timestamp;
    }

    // ========== Errors
    /// @dev See {IERC4626-maxRedeem}.
    error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        IERC20 asset_,
        address owner_
    ) public initializer {
        ERC20Upgradeable.__ERC20_init(name_, symbol_);
        ERC20PausableUpgradeable.__ERC20Pausable_init();
        OwnableUpgradeable.__Ownable_init(owner_);
        UUPSUpgradeable.__UUPSUpgradeable_init();

        _asset = asset_;

        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(asset_);
        _decimals = success ? assetDecimals : 18;

        price = 10 ** PRICE_DECIMALS; // Set initial price to 1
        priceUpdatedAt = uint32(block.timestamp);
        _createdAt = uint32(block.timestamp);
    }

    // =========== External Functions
    /// @dev Follows {IERC4626-deposit}, but deposits are queued and shares are only minted later
    function deposit(
        uint256 assets,
        address receiver
    ) external virtual whenNotPaused {
        SafeERC20.safeTransferFrom(_asset, _msgSender(), address(this), assets);
        SafeERC20.safeTransfer(_asset, owner(), assets);

        PendingDeposit memory item = PendingDeposit(
            _msgSender(),
            receiver,
            assets,
            uint32(block.timestamp)
        );
        DoubleEndedQueue.pushBack(_depositQueue, abi.encode(item));
    }

    /**
     *  @dev Follows {IERC4626-redeem}, shares are held in the contract and burned during processing
     *       Shares are held in the contract to avoid user transfers while queued
     *       Owner is not contract owner, but the owner of the shares
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    ) external virtual whenNotPaused {
        uint256 maxShares = maxRedeem(owner_);
        if (shares > maxShares) {
            revert ERC4626ExceededMaxRedeem(owner_, shares, maxShares);
        }

        address caller = _msgSender();
        if (caller != owner_) {
            _spendAllowance(owner_, caller, shares);
        }

        // Hold the shares in the contract, and burn them later when processed
        // This blocks users from transfering shares while in the queue
        _transfer(owner_, address(this), shares);

        PendingRedeem memory item = PendingRedeem(
            caller,
            owner_,
            receiver,
            shares,
            uint32(block.timestamp)
        );
        DoubleEndedQueue.pushBack(_redeemQueue, abi.encode(item));
    }

    /// @notice Previews the amount of shares that will be minted for the next `number` deposits
    function previewProcessDeposits(
        uint128 number
    ) external view onlyUpdatedPrice returns (uint256 assets, uint256 shares) {
        for (uint128 i = 0; i < number; i++) {
            PendingDeposit memory item = abi.decode(
                DoubleEndedQueue.at(_depositQueue, i),
                (PendingDeposit)
            );
            assets += item.assets;
        }

        shares = convertToShares(assets);
        return (assets, shares);
    }

    /// @notice Preview the amount of assets that will be sent, and withdrawal fee earned for the next `number` redeems
    function previewProcessRedeems(
        uint128 number
    )
        external
        view
        onlyUpdatedPrice
        returns (uint256 assets, uint256 shares, uint256 fee)
    {
        for (uint256 i = 0; i < number; i++) {
            PendingRedeem memory item = abi.decode(
                DoubleEndedQueue.at(_redeemQueue, i),
                (PendingRedeem)
            );
            shares += item.shares;
        }

        assets = previewRedeem(shares);
        fee = convertToAssets(shares) - assets;
        return (assets, shares, fee);
    }

    // =========== External Functions only for owner
    function updatePrice(uint256 price_) external onlyOwner {
        require(price_ > 0, "Price must be greater than 0");
        price = price_;
        priceUpdatedAt = uint32(block.timestamp);
        emit PriceUpdate(price_);
    }

    function updateWithdrawalFee(uint256 withdrawalFee_) external onlyOwner {
        withdrawalFee = withdrawalFee_;
        emit WithdrawalFeeUpdate(withdrawalFee_);
    }

    /// @notice Reverts the next deposit, refunding the assets to the sender
    function revertFrontDeposit() external onlyOwner {
        PendingDeposit memory item = abi.decode(
            DoubleEndedQueue.popFront(_depositQueue),
            (PendingDeposit)
        );
        // Get the assets back from the owner...
        SafeERC20.safeTransferFrom(
            _asset,
            _msgSender(),
            address(this),
            item.assets
        );
        // ...and transfer deposit back original sender
        SafeERC20.safeTransfer(_asset, item.sender, item.assets);
    }

    /// @notice Reverts the next redeem, refunding the shares to the owner
    function revertFrontRedeem() external onlyOwner {
        PendingRedeem memory item = abi.decode(
            DoubleEndedQueue.popFront(_redeemQueue),
            (PendingRedeem)
        );
        // Transfer shares back previously locked in the contract pending redeem
        _transfer(address(this), item.owner, item.shares);
    }

    /// @notice Mints shares for the next `number` deposits
    function processDeposits(
        uint128 number
    ) external onlyOwner onlyUpdatedPrice {
        for (uint128 i = 0; i < number; i++) {
            PendingDeposit memory item = abi.decode(
                DoubleEndedQueue.popFront(_depositQueue),
                (PendingDeposit)
            );
            uint256 shares = convertToShares(item.assets);
            _mint(item.receiver, shares);
            emit Deposit(item.sender, item.receiver, item.assets, shares);
        }
    }

    /// @notice Sends assets to the receiver, and burns the shares for the next `number` redeems
    function processRedeems(
        uint128 number,
        uint256 total
    ) external onlyOwner onlyUpdatedPrice {
        SafeERC20.safeTransferFrom(_asset, _msgSender(), address(this), total);

        for (uint256 i = 0; i < number; i++) {
            PendingRedeem memory item = abi.decode(
                DoubleEndedQueue.popFront(_redeemQueue),
                (PendingRedeem)
            );

            uint256 assets = previewRedeem(item.shares);

            // Burn the shares locked in the contract until now
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

        // Expect all the assets to be spent, otherwise something went wrong
        require(_asset.balanceOf(address(this)) == 0, "Incorrect amount given");
    }

    /// @dev Should pause all user actions (deposit, redeem)
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Allows the owner to withdraw any ERC20 token sent to the contract outside of deposit
    /// @dev No equivalent for ETH as it can't be recieve due to no fallback function
    function withdrawalToOwner(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "Contract has no balance");
        require(token.transfer(owner(), balance), "Transfer failed");
    }

    // =========== External Functions that are view
    /// @notice Returns the current pending deposits in the queue
    function pendingDeposits() external view returns (PendingDeposit[] memory) {
        uint256 len = DoubleEndedQueue.length(_depositQueue);
        PendingDeposit[] memory queueItems = new PendingDeposit[](len);
        for (uint256 i = 0; i < len; i++) {
            queueItems[i] = abi.decode(
                DoubleEndedQueue.at(_depositQueue, i),
                (PendingDeposit)
            );
        }
        return queueItems;
    }

    /// @notice Returns the current pending redeems in the queue
    function pendingRedeems() external view returns (PendingRedeem[] memory) {
        uint256 len = DoubleEndedQueue.length(_redeemQueue);
        PendingRedeem[] memory queueItems = new PendingRedeem[](len);
        for (uint128 i = 0; i < len; i++) {
            queueItems[i] = abi.decode(
                DoubleEndedQueue.at(_redeemQueue, i),
                (PendingRedeem)
            );
        }
        return queueItems;
    }

    // =========== Public Functions
    /// @dev See {IERC4626-asset}.
    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    /// @notice Estimates using current price, amount of assets exchanged for given number of shares
    /// @dev See {IERC4626-convertToShares}.
    function convertToAssets(
        uint256 shares
    ) public view virtual returns (uint256) {
        return
            Math.mulDiv(
                shares,
                price,
                10 ** PRICE_DECIMALS,
                Math.Rounding.Floor
            );
    }

    /// @notice Estimates using current price, amount of shares that would be minted for given assets
    /// @dev See {IERC4626-convertToShares}.
    function convertToShares(
        uint256 assets
    ) public view virtual returns (uint256) {
        return
            Math.mulDiv(
                assets,
                10 ** PRICE_DECIMALS,
                price,
                Math.Rounding.Floor
            );
    }

    /// @notice Timestamp when the vault was created
    function createdAt() public view virtual returns (uint32) {
        return _createdAt;
    }

    /// @dev See {IERC4626-decimals}.
    function decimals()
        public
        view
        virtual
        override(ERC20Upgradeable)
        returns (uint8)
    {
        return _decimals;
    }

    /// @notice Estimates using current price, amount of shares that would be minted for given assets
    /// @dev See {IERC4626-maxDeposit}.
    function maxDeposit(address) public view virtual returns (uint256) {
        return type(uint256).max; // No limit
    }

    /// @dev See {IERC4626-maxRedeem}.
    ///      Owner is not contract owner, but the owner of the shares
    function maxRedeem(address owner_) public view virtual returns (uint256) {
        return balanceOf(owner_);
    }

    /// @dev See {IERC4626-previewDeposit}.
    function previewDeposit(
        uint256 assets
    ) public view virtual returns (uint256) {
        return convertToShares(assets);
    }

    /// @notice Estimates using current price, amount of assets exchanged for given number of shares.
    ///         Includes withdrawal fee
    /// @dev See {IERC4626-previewRedeem}.
    function previewRedeem(
        uint256 shares
    ) public view virtual returns (uint256) {
        uint256 assets = convertToAssets(shares);
        uint256 fee = Math.mulDiv(
            assets,
            withdrawalFee,
            10 ** FEE_DECIMALS,
            Math.Rounding.Ceil
        );
        return assets - fee;
    }

    /// @notice Returns the total amount of the underlying assets that is "managed" by the vault.
    /// @dev See {IERC4626-totalAssets}.
    function totalAssets() public view virtual returns (uint256) {
        return convertToAssets(totalSupply());
    }

    // ========== Internal Functions
    /**
     * @dev Attempts to fetch the asset decimals and returns false if failed in some way.
     *      Taken from OpenZeppelin/contracts/token/ERC20/extensions/ERC4626.sol
     */
    function _tryGetAssetDecimals(
        IERC20 asset_
    ) private view returns (bool, uint8) {
        (bool success, bytes memory encodedDecimals) = address(asset_)
            .staticcall(abi.encodeCall(IERC20Metadata.decimals, ()));
        if (success && encodedDecimals.length >= 32) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            if (returnedDecimals <= type(uint8).max) {
                return (true, uint8(returnedDecimals));
            }
        }
        return (false, 0);
    }

    ///@dev Required by the OpenZepplin UUPSUpgradeable module
    function _authorizeUpgrade(
        address
    ) internal override(UUPSUpgradeable) onlyOwner {}

    // The following functions are overrides required by Solidity.
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, value);
    }
}
