# Solidity API

## Vault

\_This contract represents a vault that allows users to deposit and redeem assets at any time.
However, these actions are queued and processed by the owner at a later date.
The conversion of assets to shares and vice versa is based on the price at the time of processing,
which can be updated by the owner at any time.

     The expected user journey is as follows:
     1. Users deposit assets into the vault using the `deposit` function.
     2. The owner processes the deposit, minting shares to the user using the `processDeposits` function.
     3. Users can redeem their shares for assets using the `redeem` function.
     4. The owner processes the redeem, sending the assets to the user and burning the shares using the `processRedeems` function.

     This contract implements a subset of the OpenZeppelin ERC-4626 standard, and the functions are referenced accordingly._

### PRICE_DECIMALS

```solidity
uint256 PRICE_DECIMALS
```

### FEE_DECIMALS

```solidity
uint256 FEE_DECIMALS
```

### \_createdAt

```solidity
uint32 _createdAt
```

Timestamp of when the contract was created

### priceUpdatedAt

```solidity
uint32 priceUpdatedAt
```

Timestamp of when the price was last updated

_Used to determine if the price is outdated when processing deposits and redeems_

### price

```solidity
uint256 price
```

### withdrawalFee

```solidity
uint256 withdrawalFee
```

_10\*\*6 would be 100%_

### Deposit

```solidity
event Deposit(address sender, address owner, uint256 assets, uint256 shares)
```

_Emited when queued deposit is processed. See {IERC4626}._

### Withdraw

```solidity
event Withdraw(address sender, address receiver, address owner, uint256 assets, uint256 shares)
```

_Emited when queued redeem is processed. See {IERC4626}._

### PriceUpdate

```solidity
event PriceUpdate(uint256 price)
```

_Emited when price is udpated_

### onlyUpdatedPrice

```solidity
modifier onlyUpdatedPrice()
```

### DepositItem

```solidity
struct DepositItem {
  address sender;
  address receiver;
  uint256 assets;
  uint32 timestamp;
}
```

### RedeemItem

```solidity
struct RedeemItem {
  address caller;
  address owner;
  address receiver;
  uint256 shares;
  uint32 timestamp;
}
```

### ERC4626ExceededMaxRedeem

```solidity
error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)
```

_See {IERC4626-maxRedeem}._

### initialize

```solidity
function initialize(string name_, string symbol_, contract IERC20 asset_, address owner_) public
```

### deposit

```solidity
function deposit(uint256 assets, address receiver) external virtual
```

_Follows {IERC4626-deposit}, but deposits are queued and shares are only minted later_

### redeem

```solidity
function redeem(uint256 shares, address receiver, address owner_) external virtual
```

@dev Follows {IERC4626-redeem}, shares are held in the contract and burned during processing
Shares are held in the contract to avoid user transfers while queued
Owner is not contract owner, but the owner of the shares

### previewProcessDeposits

```solidity
function previewProcessDeposits(uint128 number) external view returns (uint256 assets, uint256 shares)
```

Previews the amount of shares that will be minted for the next `number` deposits

### previewProcessRedeems

```solidity
function previewProcessRedeems(uint128 number) external view returns (uint256 assets, uint256 shares, uint256 fee)
```

Preview the amount of assets that will be sent, and withdrawal fee earned for the next `number` redeems

### updatePrice

```solidity
function updatePrice(uint256 newPrice) external
```

### updateWithdrawalFee

```solidity
function updateWithdrawalFee(uint256 withdrawalFee_) external
```

### revertFrontDeposit

```solidity
function revertFrontDeposit() external
```

Reverts the next deposit, refunding the assets to the sender

### revertFrontRedeem

```solidity
function revertFrontRedeem() external
```

Reverts the next redeem, refunding the shares to the owner

### processDeposits

```solidity
function processDeposits(uint128 number) external
```

Mints shares for the next `number` deposits

### processRedeems

```solidity
function processRedeems(uint128 number, uint256 total) external
```

Sends assets to the receiver, and burns the shares for the next `number` redeems

### pause

```solidity
function pause() external
```

_Should pause all user actions (deposit, redeem)_

### unpause

```solidity
function unpause() external
```

### withdrawalToOwner

```solidity
function withdrawalToOwner(contract IERC20 token) external
```

Allows the owner to withdraw any ERC20 token sent to the contract outside of deposit

_No equivalent for ETH as it can't be recieve due to no fallback function_

### pendingDeposits

```solidity
function pendingDeposits() external view returns (struct Vault.DepositItem[])
```

Returns the current pending deposits in the queue

### pendingRedeems

```solidity
function pendingRedeems() external view returns (struct Vault.RedeemItem[])
```

Returns the current pending redeems in the queue

### asset

```solidity
function asset() public view virtual returns (address)
```

_See {IERC4626-asset}._

### convertToAssets

```solidity
function convertToAssets(uint256 shares) public view virtual returns (uint256)
```

Estimates using current price, amount of assets exchanged for given number of shares

_See {IERC4626-convertToShares}._

### convertToShares

```solidity
function convertToShares(uint256 assets) public view virtual returns (uint256)
```

Estimates using current price, amount of shares that would be minted for given assets

_See {IERC4626-convertToShares}._

### createdAt

```solidity
function createdAt() public view virtual returns (uint32)
```

Timestamp when the vault was created

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

_See {IERC4626-decimals}._

### maxDeposit

```solidity
function maxDeposit(address) public view virtual returns (uint256)
```

Estimates using current price, amount of shares that would be minted for given assets

_See {IERC4626-maxDeposit}._

### maxRedeem

```solidity
function maxRedeem(address owner_) public view virtual returns (uint256)
```

_See {IERC4626-maxRedeem}.
Owner is not contract owner, but the owner of the shares_

### previewDeposit

```solidity
function previewDeposit(uint256 assets) public view virtual returns (uint256)
```

_See {IERC4626-previewDeposit}._

### previewRedeem

```solidity
function previewRedeem(uint256 shares) public view virtual returns (uint256)
```

Estimates using current price, amount of assets exchanged for given number of shares
Includes withdrawal fee

_See {IERC4626-previewRedeem}._

### totalAssets

```solidity
function totalAssets() public view virtual returns (uint256)
```

Returns the total amount of the underlying assets that is "managed" by the vault.

_See {IERC4626-totalAssets}._

### \_authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal
```

_Required by the OpenZepplin UUPSUpgradeable module_
