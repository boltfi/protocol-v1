// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC20Upgradeable as ERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20PausableUpgradeable as ERC20Pausable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable as UUPS} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {DoubleEndedQueue as Queue} from "./libraries/DoubleEndedQueue.sol";

/// @title Vault based on a subset of ERC-4626, deposits and redeems are queued and processed by the owner
/// @custom:security-contact security@bolti.io
contract Vault is Initializable, ERC20, ERC20Pausable, Ownable, UUPS {
    uint256 public constant PRICE_DECIMALS = 18;
    uint256 public constant FEE_DECIMALS = 6;

    IERC20 private _asset; // Underlying asset contract of the vault. See {IERC4626-asset}.
    uint8 private _decimals; /// Decimals of the Vault LP Token
    uint32 public createdAt; // Timestamp of when the contract was created
    uint32 public priceUpdatedAt; // Timestamp of when price was last updated
    uint256 public price; // Price of the vault in 10 ** PRICE_DECIMALS decimals
    uint256 public withdrawalFee; // 10 ** FEE_DECIMALS would be 100%
    Queue.BytesDeque private _depositQueue;
    Queue.BytesDeque private _redeemQueue;

    event PriceUpdate(uint256 price);
    event WithdrawalFeeUpdate(uint256 withdrawalFee);
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max);

    modifier onlyUpdatedPrice() {
        require(priceUpdatedAt > block.timestamp - 1 days, "Price is outdated");
        _;
    }

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory name_, string memory symbol_, IERC20 asset_, address owner_) public initializer {
        ERC20.__ERC20_init(name_, symbol_);
        ERC20Pausable.__ERC20Pausable_init();
        Ownable.__Ownable_init(owner_);
        UUPS.__UUPSUpgradeable_init();

        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(asset_);
        _asset = asset_;
        _decimals = success ? assetDecimals : 18;

        price = 10 ** PRICE_DECIMALS; // Set initial price to 1
        priceUpdatedAt = uint32(block.timestamp);
        createdAt = uint32(block.timestamp);
    }

    // ================ External Functions =============================================================================
    /// @dev Follows {IERC4626-deposit}, but deposits are queued and shares are only minted later
    function deposit(uint256 assets, address receiver) external virtual whenNotPaused {
        SafeERC20.safeTransferFrom(_asset, _msgSender(), address(this), assets);
        SafeERC20.safeTransfer(_asset, owner(), assets);

        PendingDeposit memory item = PendingDeposit(_msgSender(), receiver, assets, uint32(block.timestamp));
        Queue.pushBack(_depositQueue, abi.encode(item));
    }

    ///  @dev Owner is not contract owner, but the owner of the shares. Follows {IERC4626-redeem}
    function redeem(uint256 shares, address receiver, address owner_) external virtual whenNotPaused {
        address caller = _msgSender();
        uint256 maxShares = maxRedeem(owner_);

        if (shares > maxShares) {
            revert ERC4626ExceededMaxRedeem(owner_, shares, maxShares);
        }

        if (caller != owner_) {
            _spendAllowance(owner_, caller, shares);
        }

        _transfer(owner_, address(this), shares); // Keep shares in contract till processed to avoid user transfers

        PendingRedeem memory item = PendingRedeem(caller, owner_, receiver, shares, uint32(block.timestamp));
        Queue.pushBack(_redeemQueue, abi.encode(item));
    }

    // ================ External Functions only for owner ==============================================================
    /// @notice Mints shares for the next `number` deposits
    function processDeposits(uint128 number) external onlyOwner onlyUpdatedPrice {
        for (uint128 i = 0; i < number; i++) {
            PendingDeposit memory item = abi.decode(Queue.popFront(_depositQueue), (PendingDeposit));
            uint256 shares = convertToShares(item.assets);
            _mint(item.receiver, shares);
            emit Deposit(item.sender, item.receiver, item.assets, shares);
        }
    }

    /// @notice Sends assets to the receiver, and burns the shares for the next `number` redeems
    function processRedeems(uint128 number, uint256 total) external onlyOwner onlyUpdatedPrice {
        SafeERC20.safeTransferFrom(_asset, _msgSender(), address(this), total);

        for (uint256 i = 0; i < number; i++) {
            PendingRedeem memory item = abi.decode(Queue.popFront(_redeemQueue), (PendingRedeem));

            _burn(address(this), item.shares);

            uint256 assets = previewRedeem(item.shares);
            SafeERC20.safeTransfer(_asset, item.receiver, assets);
            emit Withdraw(item.caller, item.receiver, item.owner, assets, item.shares);
        }

        require(_asset.balanceOf(address(this)) == 0, "Incorrect total given"); // Avoid keeping assets in the contract
    }

    /// @notice Reverts the next deposit, get assets from the owner and send back to original sender
    function revertFrontDeposit() external onlyOwner {
        PendingDeposit memory item = abi.decode(Queue.popFront(_depositQueue), (PendingDeposit));
        SafeERC20.safeTransferFrom(_asset, owner(), address(this), item.assets);
        SafeERC20.safeTransfer(_asset, item.sender, item.assets);
    }

    /// @notice Reverts the next redeem, refunding the shares to the owner that were previous locked in the contract
    function revertFrontRedeem() external onlyOwner {
        PendingRedeem memory item = abi.decode(Queue.popFront(_redeemQueue), (PendingRedeem));
        _transfer(address(this), item.owner, item.shares);
    }

    function updatePrice(uint256 price_) external onlyOwner {
        require(price_ > 0, "Price must be greater than 0"); // Avoid causing issues with division
        price = price_;
        priceUpdatedAt = uint32(block.timestamp);
        emit PriceUpdate(price_);
    }

    function updateWithdrawalFee(uint256 withdrawalFee_) external onlyOwner {
        require(withdrawalFee_ <= 10 ** FEE_DECIMALS, "Withdrawal fee must be less than 100%");
        withdrawalFee = withdrawalFee_;
        emit WithdrawalFeeUpdate(withdrawalFee_);
    }

    /// @dev Should pause all user actions (deposit, redeem)
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev No equivalent for ETH as it can't be recieve due to no fallback function
    function withdrawalToOwner(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "Contract has no balance");
        SafeERC20.safeTransfer(token, owner(), balance);
    }

    // ================ External Functions that are view ===============================================================
    /// @notice Returns the current pending deposits in the queue
    function pendingDeposits() external view returns (PendingDeposit[] memory queue) {
        queue = new PendingDeposit[](Queue.length(_depositQueue));
        for (uint256 i = 0; i < queue.length; i++) {
            queue[i] = abi.decode(Queue.at(_depositQueue, i), (PendingDeposit));
        }
    }

    /// @notice Returns the current pending redeems in the queue
    function pendingRedeems() external view returns (PendingRedeem[] memory queue) {
        queue = new PendingRedeem[](Queue.length(_redeemQueue));
        for (uint128 i = 0; i < queue.length; i++) {
            queue[i] = abi.decode(Queue.at(_redeemQueue, i), (PendingRedeem));
        }
    }

    // ================ Public Functions ===============================================================================
    /// @notice Underlying asset of the vault. See {IERC4626-asset}.
    function asset() public view virtual returns (address) {
        return address(_asset);
    }

    /// @notice Estimates assets recieved for `shares` at current price (no fees). See {IERC4626-convertToAssets}.
    function convertToAssets(uint256 shares) public view virtual returns (uint256) {
        return Math.mulDiv(shares, price, 10 ** PRICE_DECIMALS, Math.Rounding.Floor);
    }

    /// @notice Estimates shares recieved for `assets` at current price. See {IERC4626-convertToShares}.
    function convertToShares(uint256 assets) public view virtual returns (uint256) {
        return Math.mulDiv(assets, 10 ** PRICE_DECIMALS, price, Math.Rounding.Floor);
    }

    /// @notice Number of decimals to display. See {IERC4626-decimals}.
    function decimals() public view virtual override(ERC20) returns (uint8) {
        return _decimals;
    }

    /// @notice Maximum deposit by `address`. See {IERC4626-maxDeposit}.
    function maxDeposit(address) public view virtual returns (uint256) {
        return type(uint256).max; // No limit
    }

    /// @dev See {IERC4626-maxRedeem}. Note Owner is not contract owner, but the owner of the shares
    function maxRedeem(address owner_) public view virtual returns (uint256) {
        return balanceOf(owner_);
    }

    /// @dev See {IERC4626-previewDeposit}.
    function previewDeposit(uint256 assets) public view virtual returns (uint256) {
        return convertToShares(assets);
    }

    /// @notice Estimates assets recieved for `shares` at current price (with fees). See {IERC4626-previewRedeem}.
    function previewRedeem(uint256 shares) public view virtual returns (uint256) {
        uint256 assets = convertToAssets(shares);
        uint256 fee = Math.mulDiv(assets, withdrawalFee, 10 ** FEE_DECIMALS, Math.Rounding.Ceil);
        return assets - fee;
    }

    /// @notice Total amount of the underlying assets that is "managed" by the vault.  See {IERC4626-totalAssets}.
    function totalAssets() public view virtual returns (uint256) {
        return convertToAssets(totalSupply());
    }

    // ================ Internal Functions =============================================================================
    ///@dev Required by the OpenZepplin UUPSUpgradeable module
    function _authorizeUpgrade(address) internal override(UUPS) onlyOwner {}

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }

    /// @dev Attempts to fetch the asset decimals and returns false if failed in some way. From Openzeppelin ERC4626
    function _tryGetAssetDecimals(IERC20 asset_) private view returns (bool, uint8) {
        (bool success, bytes memory encodedDecimals) = address(asset_).staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );
        if (success && encodedDecimals.length >= 32) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            if (returnedDecimals <= type(uint8).max) {
                return (true, uint8(returnedDecimals));
            }
        }
        return (false, 0);
    }
}
