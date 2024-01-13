# Solidity API

## DepositItem

```solidity
struct DepositItem {
  address sender;
  address receiver;
  uint256 assets;
  uint32 timestamp;
}
```

## RedeemItem

```solidity
struct RedeemItem {
  address caller;
  address owner;
  address receiver;
  uint256 shares;
  uint32 timestamp;
}
```

## DepositQueue

### Queue

```solidity
struct Queue {
  uint128 first;
  uint128 last;
  mapping(uint128 => struct DepositItem) items;
}
```

### initialize

```solidity
function initialize(struct DepositQueue.Queue queue) internal
```

### pushBack

```solidity
function pushBack(struct DepositQueue.Queue queue, struct DepositItem item) internal
```

### popFront

```solidity
function popFront(struct DepositQueue.Queue queue) internal returns (struct DepositItem)
```

## RedeemQueue

### Queue

```solidity
struct Queue {
  uint128 first;
  uint128 last;
  mapping(uint128 => struct RedeemItem) items;
}
```

### initialize

```solidity
function initialize(struct RedeemQueue.Queue queue) internal
```

### pushBack

```solidity
function pushBack(struct RedeemQueue.Queue queue, struct RedeemItem item) internal
```

### popFront

```solidity
function popFront(struct RedeemQueue.Queue queue) internal returns (struct RedeemItem)
```

## Vault

### ERC4626ExceededMaxRedeem

```solidity
error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)
```

_Attempted to redeem more shares than the max amount for `receiver`._

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

### totalDepositedAssets

```solidity
uint256 totalDepositedAssets
```

### totalWithdrawnAssets

```solidity
uint256 totalWithdrawnAssets
```

### onlyUpdatedPrice

```solidity
modifier onlyUpdatedPrice()
```

### constructor

```solidity
constructor(string name_, string symbol_, contract IERC20 asset_, address owner_) public
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

### asset

```solidity
function asset() public view virtual returns (address)
```

### totalAssets

```solidity
function totalAssets() public view virtual returns (uint256)
```

### updatePrice

```solidity
function updatePrice(uint256 newPrice) public
```

### updateWithdrawalFee

```solidity
function updateWithdrawalFee(uint256 withdrawalFee_) public
```

### depositQueue

```solidity
function depositQueue() public view returns (struct DepositItem[])
```

### redeemQueue

```solidity
function redeemQueue() public view returns (struct RedeemItem[])
```

### deposit

```solidity
function deposit(uint256 assets, address receiver) public virtual
```

### convertToShares

```solidity
function convertToShares(uint256 assets) public view virtual returns (uint256)
```

### convertToAssets

```solidity
function convertToAssets(uint256 shares) public view virtual returns (uint256)
```

### processDeposits

```solidity
function processDeposits(uint128 number) public
```

### maxRedeem

```solidity
function maxRedeem(address owner_) public view virtual returns (uint256)
```

_See {IERC4626-maxRedeem}._

### redeem

```solidity
function redeem(uint256 shares, address receiver, address owner_) public virtual
```

### processRedeems

```solidity
function processRedeems(uint128 number, uint256 total) public
```

### withdrawalToOwner

```solidity
function withdrawalToOwner(contract IERC20 token) external
```

_ETH can't be recieve as the contract has no fallback function_

### pause

```solidity
function pause() external
```

### unpause

```solidity
function unpause() external
```

