# Boltfi Vault Protocol v1

A vault based on a subset of ERC-4626

This contract represents a vault that allows users to deposit and redeem assets at any time.
However, these actions are queued and processed by the owner at a later date.
The conversion of assets to shares and vice versa is based on the price at the time of processing,
which can be updated by the owner at any time.

The expected user journey is as follows:

1. Users deposit assets into the vault using the `deposit` function.
2. The owner processes the deposit, minting shares to the user using the `processDeposits` function.
3. Users can redeem their shares for assets using the `redeem` function.
4. The owner processes the redeem, sending the assets to the user and burning the shares using the `processRedeems` function.

## Developers

This contract implements a subset of the OpenZeppelin ERC-4626 standard, and the functions are referenced accordingly.
This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a script that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat test
```
