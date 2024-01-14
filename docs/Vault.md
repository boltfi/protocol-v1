# Solidity API

## Vault

### price

```solidity
uint256 price
```

### priceUpdatedAt

```solidity
uint256 priceUpdatedAt
```

### withdrawalFee

```solidity
uint256 withdrawalFee
```

### totalAssetsDeposited

```solidity
uint256 totalAssetsDeposited
```

### totalAssetsWithdrawn

```solidity
uint256 totalAssetsWithdrawn
```

### Deposit

```solidity
event Deposit(address sender, address owner, uint256 assets, uint256 shares)
```

### Withdraw

```solidity
event Withdraw(address sender, address receiver, address owner, uint256 assets, uint256 shares)
```

### PriceUpdate

```solidity
event PriceUpdate(uint256 price)
```

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

_Attempted to redeem more shares than the max amount for `receiver`._

### constructor

```solidity
constructor(string name_, string symbol_, contract IERC20 asset_, address owner_) public
```

### deposit

```solidity
function deposit(uint256 assets, address receiver) external virtual
```

### redeem

```solidity
function redeem(uint256 shares, address receiver, address owner_) external virtual
```

### updatePrice

```solidity
function updatePrice(uint256 newPrice) external
```

### updateWithdrawalFee

```solidity
function updateWithdrawalFee(uint256 withdrawalFee_) external
```

### processDeposits

```solidity
function processDeposits(uint128 number) external
```

### processRedeems

```solidity
function processRedeems(uint128 number, uint256 total) external
```

### pause

```solidity
function pause() external
```

### unpause

```solidity
function unpause() external
```

### withdrawalToOwner

```solidity
function withdrawalToOwner(contract IERC20 token) external
```

_ETH can't be recieve as the contract has no fallback function_

### pendingDeposits

```solidity
function pendingDeposits() external view returns (struct Vault.DepositItem[])
```

### pendingRedeems

```solidity
function pendingRedeems() external view returns (struct Vault.RedeemItem[])
```

### asset

```solidity
function asset() public view virtual returns (address)
```

### convertToAssets

```solidity
function convertToAssets(uint256 shares) public view virtual returns (uint256)
```

### convertToShares

```solidity
function convertToShares(uint256 assets) public view virtual returns (uint256)
```

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

_Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the default value returned by this function, unless
it's overridden.

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

### maxDeposit

```solidity
function maxDeposit(address) public view virtual returns (uint256)
```

### maxRedeem

```solidity
function maxRedeem(address owner_) public view virtual returns (uint256)
```

_See {IERC4626-maxRedeem}._

### totalAssets

```solidity
function totalAssets() public view virtual returns (uint256)
```

