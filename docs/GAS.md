# Payrail gas report

Measured on **Arc Testnet** (chain `5042002`) using the live API, the deployed
`PayrailRouter`, and the payer wallet settlement path (`approve` → swap /
`batchTransfer`), with gas priced in native USDC (`0x3600…`, 18 decimals).

## Methodology

`scripts/gas-report.ts` builds a USDC-only payout plan per batch size and
executes it end-to-end against the deployed router:

1. `POST /v1/payout` (approve + batchPayout steps only, no swap leg).
2. Broadcast each step's calldata with the payer wallet (`sendTransaction`).
3. Read each receipt; gas = `Σ gasUsed × effectiveGasPrice`.

No re-usable pool state is touched by gas batches beyond the approval
allowance, so the numbers are stable across runs.

Run it:

```bash
npx tsx scripts/deploy-router.ts          # once
export PAYRAIL_ROUTER_ADDRESS_TESTNET=... # or keep in scripts/.env
npx tsx scripts/gas-report.ts             # needs funded payer in scripts/.env
```

## Results (2026-09, testnet)

Measured at a constant effective gas price of **25 Gwei** (native USDC, 18-dec).

| recipients | gas used (units) | gas cost (base USDC, 6-dec) | cost / recipient |
|---|---|---|---|
| 1  | 127,679 | 3,191  | 3,191 |
| 10 | 293,055 | 7,326  | 732  |
| 100 | 4,197,289 | 104,932 | 1,049 |

Regenerate with `npx tsx scripts/gas-report.ts --per-recipient 4000 --verbose`
(after refilling the payer wallet — see Funding notes). Because testnet gas
price can drift, the report also prints raw gas **units**, which are
fee-independent and directly comparable.

## Interpreting the cost

Each plan is one approval tx plus one batch/swaps tx:

- `approve`: ≈ 55.4k gas (≈ 0.055 USDC at 25 Gwei), shared/amortized across
  recipients — the payer pays it once per plan.
- `batchTransfer`: ≈ 72k gas for 1 recipient, growing ≈ 24–41k gas per
  additional recipient (the loop emits per-recipient logs). Total for
  100 recipients ≈ 4.2M gas ≈ 0.105 USDC.
- `swapExactIn` (USDC→EURC leg) ≈ 85k gas — negligible vs. the trade value at
  batch scale.

Convert:
- 6-dec base → USDC: `base / 1e6`.
- gas wei → base: `gasUsed × effectiveGasPrice / 1e12` (native and token are
  the same asset at 18-dec / 6-dec views).

## Funding notes

The payer wallet (`0x959139C138Fa2925B86b1d5Db4785E8C35914439`) holds both
the spendable USDC and the gas balance (same `0x3600…` token). Two options to
replenish:

1. **Recycle the pool** (recommended, self-serve): `scripts/recycle-router.ts`
   rescues the current router's reserves back to the payer and re-deploys a
   fresh `PayrailRouter` (default seed 10M USDC / 8.8M EURC; pass
   `--seed-usdc <n> --seed-eurc <n>` to size to your balances).
2. **Faucet**: https://faucet.circle.com (Arc Testnet; 20 USDC per address
   every 2 h).

E2E payout runs each consume the payer's source balance; cycle via (1) between
runs. Current deployed router / reserves are printed by
`scripts/deploy-router.ts`.