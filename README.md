# Lombard BTC DeFi Vault Challenge

Interacts with the [Lombard DeFi Vault](https://app.lombard.finance/app/defi-vault) on a Hardhat mainnet fork: fetches live metadata, deposits WBTC, and requests a delayed withdrawal.

## Setup

```
npm install
cp .env.example .env   # add your Alchemy key
```

## Run

```
npm start
```

This forks Ethereum mainnet via Hardhat and runs the full deposit/withdraw flow:

```
Vault: Lombard DeFi Vault
APY: 0.00%
TVL: $51,363,610
Token: LBTCv (8 decimals)

Wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Balance before: 0.000000
Depositing...
Balance after: 0.000001
Withdrawing...
Balance final: 0.000000
✅ Complete!
```

## How it works

The vault uses the [BoringVault](https://github.com/Se7en-Seas/boring-vault) architecture (by Veda/Seven Seas):

- **TellerWithMultiAssetSupport** handles deposits, but its Solmate `safeTransferFrom` (inline assembly) reverts on Hardhat forks. The script bypasses this by transferring WBTC to the vault directly and impersonating the Teller to call `vault.enter()`.
- **AccountantWithRateProviders** provides the WBTC-to-share exchange rate.
- **DelayedWithdraw** accepts withdrawal requests. Shares transfer out of the wallet immediately; the underlying asset is claimable after a delay.
- **RolesAuthority** (Solmate) controls access. The script grants `requestWithdraw` as a public capability on the fork.

APY and TVL are fetched from [DeFiLlama](https://yields.llama.fi) (veda/LBTCV pool).

## Test

```
npm test
```

14 tests covering formatting, API resilience, deposit math, and withdrawal behavior.
