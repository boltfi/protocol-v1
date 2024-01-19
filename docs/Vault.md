# Solidity API

## Vault

### PRICE_DECIMALS

```solidity
uint256 PRICE_DECIMALS
```

### FEE_DECIMALS

```solidity
uint256 FEE_DECIMALS
```

### createdAt

```solidity
uint32 createdAt
```

Decimals of the Vault LP Token

### priceUpdatedAt

```solidity
uint32 priceUpdatedAt
```

### price

```solidity
uint256 price
```

### withdrawalFee

```solidity
uint256 withdrawalFee
```

### PriceUpdate

```solidity
event PriceUpdate(uint256 price)
```

### WithdrawalFeeUpdate

```solidity
event WithdrawalFeeUpdate(uint256 withdrawalFee)
```

### Deposit

```solidity
event Deposit(address sender, address owner, uint256 assets, uint256 shares)
```

### Withdraw

```solidity
event Withdraw(address sender, address receiver, address owner, uint256 assets, uint256 shares)
```

### ERC4626ExceededMaxRedeem

```solidity
error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)
```

### onlyUpdatedPrice

```solidity
modifier onlyUpdatedPrice()
```

### PendingDeposit

```solidity
struct PendingDeposit {
  address sender;
  address receiver;
  uint256 assets;
  uint32 timestamp;
}
```

### PendingRedeem

```solidity
struct PendingRedeem {
  address caller;
  address owner;
  address receiver;
  uint256 shares;
  uint32 timestamp;
}
```

### constructor

```solidity
constructor() public
```

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

@dev Owner is not contract owner, but the owner of the shares. Follows {IERC4626-redeem}

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

### revertFrontDeposit

```solidity
function revertFrontDeposit() external
```

Reverts the next deposit, get assets from the owner and send back to original sender

### revertFrontRedeem

```solidity
function revertFrontRedeem() external
```

Reverts the next redeem, refunding the shares to the owner that were previous locked in the contract

### updatePrice

```solidity
function updatePrice(uint256 price_) external
```

### updateWithdrawalFee

```solidity
function updateWithdrawalFee(uint256 withdrawalFee_) external
```

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

_No equivalent for ETH as it can't be recieve due to no fallback function_

### pendingDeposits

```solidity
function pendingDeposits() external view returns (struct Vault.PendingDeposit[] queue)
```

Returns the current pending deposits in the queue

### pendingRedeems

```solidity
function pendingRedeems() external view returns (struct Vault.PendingRedeem[] queue)
```

Returns the current pending redeems in the queue

### asset

```solidity
function asset() public view virtual returns (address)
```

Underlying asset of the vault. See {IERC4626-asset}.

### convertToAssets

```solidity
function convertToAssets(uint256 shares) public view virtual returns (uint256)
```

Estimates assets recieved for `shares` at current price (no fees). See {IERC4626-convertToAssets}.

### convertToShares

```solidity
function convertToShares(uint256 assets) public view virtual returns (uint256)
```

Estimates shares recieved for `assets` at current price. See {IERC4626-convertToShares}.

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

Number of decimals to display. See {IERC4626-decimals}.

### maxDeposit

```solidity
function maxDeposit(address) public view virtual returns (uint256)
```

Maximum deposit by `address`. See {IERC4626-maxDeposit}.

### maxRedeem

```solidity
function maxRedeem(address owner_) public view virtual returns (uint256)
```

_See {IERC4626-maxRedeem}. Note Owner is not contract owner, but the owner of the shares_

### previewDeposit

```solidity
function previewDeposit(uint256 assets) public view virtual returns (uint256)
```

_See {IERC4626-previewDeposit}._

### previewRedeem

```solidity
function previewRedeem(uint256 shares) public view virtual returns (uint256)
```

Estimates assets recieved for `shares` at current price (with fees). See {IERC4626-previewRedeem}.

### totalAssets

```solidity
function totalAssets() public view virtual returns (uint256)
```

Total amount of the underlying assets that is "managed" by the vault. See {IERC4626-totalAssets}.

### \_authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal
```

_Required by the OpenZepplin UUPSUpgradeable module_

### \_update

```solidity
function _update(address from, address to, uint256 value) internal
```
