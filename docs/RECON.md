# Payrail — Arc Reconnaissance

Research date: 2026-09-24. All claims marked **verified** were confirmed either from official
Arc/Circle/Uniswap documentation, by direct RPC calls against Arc Mainnet, or by the Arc block
explorer on that date. Anything not confirmed is marked **unverified** and must be re-checked
before production use. Guesses are never recorded as facts.

Sources of truth used:
- Arc docs: https://docs.arc.io (llms.txt index, contract-addresses, connect-to-arc, gas-and-fees,
  evm-differences, supported-blockchains, swap quickstarts, account-abstraction, integrate/defi)
- Circle dev docs: https://developers.circle.com (StableFX, Paymaster)
- Block explorers: https://explorer.arc.io (mainnet), https://explorer.testnet.arc.io (testnet)
- Uniswap deployments repo: https://github.com/Uniswap/contracts/blob/main/deployments/5042.md
- Uniswap blog: "Uniswap is Live on Arc" (2026-09-16)
- GeckoTerminal Arc API: `https://api.geckoterminal.com/api/v2/networks/arc/...` (live pool data)
- Direct RPC calls to `https://rpc.mainnet.arc.io` and `https://rpc.testnet.arc.io`

---

## ⚠️ Headline finding

**Arc Mainnet is LIVE.** Chain ID `5042` responds on the public RPC, block height was
`0x158738c` (~22.6M) at recon time, and the explorer resolves mainnet contracts/txs. The
`docs.arc.io/llms.txt` still states "Arc is currently available on Testnet only" — that is
**stale/misleading**; mainnet configuration is documented in the connect-to-arc contract-address
pages and is reachable. Uniswap went live on Arc mainnet 2026-09-16.

Second headline: **USDC on Arc uses TWO decimal views sharing one balance.**
- Native gas accounting / `msg.value` / `address.balance`: **18 decimals**.
- ERC-20 interface (`balanceOf`, transfers, pools) at `0x3600…0000`: **6 decimals**.
Do not mix the two (they differ by 10¹²). The original instruction "USDC is 6 decimals, never
assume 18" is right for the ERC-20 interface, but the native gas token is 18-decimal.

---

## 1. Networks, RPC, gas, faucets, rate limits

### Mainnet (LIVE)
| Parameter | Value | Verification |
|---|---|---|
| Chain ID | `5042` (`0x13b2`) | **verified** (RPC `eth_chainId`, 2026-09-24) |
| Native gas token | USDC (ERC-20 interface 6 dec; native 18 dec) | **verified** (docs + on-chain `decimals()`) |
| Public HTTP RPC | `https://rpc.mainnet.arc.io` | **verified** (responding) |
| Alchemy RPC/WSS | `https://arc-mainnet.g.alchemy.com/v2/{KEY}` / `wss://arc-mainnet.g.alchemy.com/v2/{KEY}` | verified from docs |
| Blockdaemon RPC | `https://rpc.blockdaemon.mainnet.arc.io` | verified from docs |
| dRPC | `https://rpc.drpc.mainnet.arc.io` | verified from docs |
| QuickNode RPC/WSS | `https://rpc.quicknode.mainnet.arc.io` / `wss://rpc.quicknode.mainnet.arc.io` | verified from docs |
| Explorer | `https://explorer.arc.io` | **verified** (contract pages resolve) |
| Blocks | ~0.5 s, ~30M gas/block | verified from docs |
| Finality | Deterministic, immediate (act after 1 conf) | verified from docs |

Gas model: EIP-1559 + EWMA smoothing. Base fee min **20 Gwei** (mempool drops txs with
`maxFeePerGas` below this), max **20,000 Gwei**. Base fee paid to the block beneficiary (not
burned). `maxPriorityFeePerGas` of 0 is acceptable; a 1 Gwei tip helps under load. Set
`maxFeePerGas >= 20 Gwei` on every tx. Fee target ≈ $0.001 per ERC-20 transfer.

**Mainnet funds:** there is **no mainnet faucet**. USDC reaches Arc mainnet via CCTP bridge
(App Kit Bridge / Circle Console), Circle Mint (institutional), or a supporting exchange. Gas
is paid in the same USDC your wallet already holds.

### Testnet
| Parameter | Value | Verification |
|---|---|---|
| Chain ID | `5042002` (`0x4cef52`) | **verified** (RPC, 2026-09-24) |
| Public HTTP/WSS RPC | `https://rpc.testnet.arc.io` / `wss://rpc.testnet.arc.io` | **verified** |
| Third-party RPC | Blockdaemon, dRPC, QuickNode variants | verified from docs |
| Explorer | `https://explorer.testnet.arc.io` | verified from docs |
| Faucet | `https://faucet.circle.com` (select Arc Testnet; USDC and EURC available) | **verified** from docs |
| Gas mechanics | Same 20 Gwei floor, USDC-denominated | verified from docs |

### Rate limits
- Arc docs publish **no explicit RPC rate limit** for the public endpoints. Treat them as
  best-effort and use a node provider (Alchemy/QuickNode/Blockdaemon/dRPC) for production.
- App Kit Swap without a Circle API key "shares a rate limit"; **API keys are per-environment**
  (a separate key for testnet and mainnet), issued from the Circle Console
  (`https://console.circle.com/api-keys`).

---

## 2. Token addresses and decimals

ERC-20 `decimals()` / `symbol()` values below marked "on-chain verified" were read directly from
Arc **Mainnet** via `eth_call` on 2026-09-24. Testnet addresses are **documented only**
(re-verify on-chain before using them in code).

| Token | Mainnet address | Decimals | Testnet address | Notes / verification |
|---|---|---|---|---|
| **USDC (native gas, ERC-20 interface)** | `0x3600000000000000000000000000000000000000` | 6 (ERC-20) / 18 (native) | same address | **docs + on-chain verified** (both nets share this address). No WETH-style wrapper exists for USDC; the native asset already satisfies `IERC20`. |
| **EURC** | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | 6 | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | **mainnet on-chain verified** (`decimals=6`, `symbol=EURC`); testnet documented |
| **cirBTC** | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | 8 | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | **mainnet on-chain verified** (`decimals=8`); testnet documented |
| **WETH (bridged)** | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` | 18 | `0x2c4047028a72803939b6fb674D01bC059B5C4961` | **mainnet on-chain verified** (`decimals=18`); testnet documented |
| **USYC (yield, permit-listed)** | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | 6 | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | **mainnet on-chain verified**. Institutions only, non-US, $100k minimum, allowlist; **out of MVP scope** |
| USDT / USDe / DAI / PYUSD | — not on Arc — | — | — | App Kit Swap explicitly lists only USDC, EURC, cirBTC for Arc; geckoterminal shows no USDT-like stablecoin pools. **Not available** |
| Wrapped-native token used by Uniswap's Arc deployment | `0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f` | **unverified** | — | Appears in Uniswap Arc deployment params as both `_WETH9` and `spokePool`. On Arc native = USDC, so wrapping semantics differ from mainnet; **verify before routing any WETH on Arc** |

USDC ERC-20 balance caveat (from EVM-differences docs): `balanceOf` on the 6-dec interface
truncates sub-USDC dust; a zero `balanceOf` does not mean the native balance is zero. Track
native balances in 18-dec and ERC-20 flows in 6-dec; never record an ERC-20 `balanceOf` as a
native balance.

### Token-alias gotcha for App Kit
Arc supports aliases `USDC`, `EURC`, `cirBTC` (resolved to the addresses above). `NATIVE` on
Arc resolves to USDC native. Do not pass unverified aliases like `USDT` on Arc — they are
not supported there.

---

## 3. App Kit Swap (programmable swap, quote-only capability)

- Packages: `@circle-fin/swap-kit` (standalone) + `@circle-fin/adapter-viem-v2` (or ethers-v6 /
  circle-wallets / solana); full SDK is `@circle-fin/app-kit`. **`kitKey` is legacy — use
  `apiKey`** (renamed upstream).
- Auth: optional Circle API key from Circle Console; env-scoped (testnet key ≠ mainnet key).
  Without one you ride a shared rate limit.
- Availability: **Swap is mainnet-only on other chains, with Arc Testnet as a documented
  exception**, so you can develop on Arc Testnet and ship on Arc Mainnet with the same code.
- Supported tokens on Arc: **USDC, EURC, cirBTC** only.
- **Quote without executing: YES.** `kit.estimateSwap({...})` returns `estimatedOutput`,
  `fees` (provider fee in input token + gas fee in USDC), and a `stopLimit` without broadcasting.
  `kit.swap(...)` then returns a `txHash` + `explorerUrl` + `progress.status`.
- Server-side oriented; docs warn Arc Testnet swap liquidity "can be unstable", while mainnet
  pools "are typically deeper".

---

## 4. Uniswap on Arc

Official deployment (Uniswap/contracts → `deployments/5042.md`), plus blog "Uniswap is Live on
Arc" (2026-09-16): **Uniswap v2, v3, and v4 are all deployed on Arc mainnet.** Uniswap API
supports chain `5042` (verified by the API reference's `tokenInChainId`/`tokenOutChainId` enums)
and requires an API key (unauthenticated calls return `ACCESS_DENIED`).

### Mainnet addresses (cross-referenced: deployment doc + code presence on RPC)
| Contract | Address | Code on mainnet RPC |
|---|---|---|
| PoolManager (v4) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | ✅ (24,009 B) |
| Universal Router 2.1.2 | `0x8702463e73f74d0b6765aBceb314Ef07aCb92650` | ✅ (24,380 B) |
| V4 Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | ✅ |
| StateView (v4) | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | doc + explorer |
| PositionManager (v4) | `0x6049c9a0e26405C0985f9E3685C87d0aE917f82B` | doc + explorer |
| UniswapV3Factory | `0xf0db7b58379503491d857dbD50AC9ece64c653918` | ✅ (24,009 B) |
| QuoterV2 (v3) | `0x7dfd4f31be6814d2906bde155c3e1b146eac1468` | ✅ |
| NonfungiblePositionManager (v3) | `0x39654A85A4C05127f5Fd6ED22CAeC077A0fB1377` | doc + explorer |
| SwapRouter02 | `0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77` | doc + explorer |
| UniswapV2Factory | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` | doc + explorer |
| UniswapV2Router02 | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` | doc + explorer |
| Permits2 / Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | doc (same as other chains) |
| PositionDescriptor, TickLens, NFTDescriptor, Multicall | see `deployments/5042.md` | doc + explorer |

> Note: do **not** use Ethereum's UniversalRouter (`0x66a9…`) or PoolManager
> (`0x000000000004444c…`) on Arc — confirmed **no code** at those addresses on Arc mainnet.
> Always use the Arc deployment addresses above.

### Pools with real liquidity (GeckoTerminal, 2026-09-24)
GeckoTerminal reports Uniswap V4/V3/V2 (+ Curve, SushiSwap, Aero etc.) on Arc. Uniswap pools
of note:

| Pool | Fee (tier) | Liquidity (USD) | 24h volume (USD) | Notes |
|---|---|---|---|---|
| WETH / USDC | 0.3% (v3) | ~$10.8M | ~$29.9M | deepest pair on Arc |
| cirBTC / USDC | 0.01% (v3) | ~$11.5M | ~$5.7M | officially promoted by Uniswap at launch |
| EURC / USDC | ~0.09% (v4 dynamic) | ~$454K | ~$542K | **the stablecoin FX pair that matters** |
| WETH / cirBTC | ~0.074% (v4 dynamic) | ~$333K | ~$487K | ancillary route |
| USDC / USDC | 1% & 2.999% pools | ~$357K / ~$58K | low | exists but meaningless (same asset) — avoid |

Lots of meme-token "to $0" pools (TOLLY, CATZ, WONK, FAZE…) show high reported volume but
sub-$1K–$10K liquidity; treat as wash-trade noise. **There are no USDT, USDe, DAI, or PYUSD
pools on Arc.** v3 `getPool` probes also found USDC/EURC (fees 100, 500, 3000, 10000),
USDC/WETH, and USDC/cirBTC pools with minimal on-range liquidity — the real volume lives on the
v4 pools listed above (32-byte pool IDs = v4 `PoolId`s).

---

## 5. Circle StableFX availability

**Institutional / permissioned only — not available to individual developers.**
- Circle docs: "StableFX is a **permissioned product that is available only to institutions**
  that have completed Circle's KYB/AML verification"; you request access via a Circle account
  representative who issues a StableFX API key.
- Litepaper: "participation is permissioned: only Circle whitelisted makers and takers can
  access StableFX"; a permissionless-taker model is only a future idea.
- Settlement uses `FxEscrow` on Arc (mainnet `0xe2E5F173576B513d994073CCbDaCBE027d43DFe6`,
  testnet `0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10`) plus a Permit2 USDC allowance.
- Pairs cover USDC + EURC + Circle Partner regional stables (MXN, PHP, CAD, ZAR…).

**Verdict:** StableFX cannot be a pricing/execution source for Payrail's MVP (we can't get an
API key as an individual team). We fall back to AMM spot (Uniswap v4) and/or App Kit Swap for
pricing.

---

## 6. Paymaster / fee-sponsorship options

- **Native model:** gas is already USDC, so EOA-style callers pay fees in USDC directly. The
  docs state multi-token gas payment via paymasters is **not** supported at launch.
- **Circle Paymaster: NOT on Arc.** Circle's permissionless ERC-4337 paymaster lists supported
  chains as Arbitrum/Base (v0.7) and Arbitrum, Avalanche, Base, Ethereum, Optimism, Polygon,
  Unichain (v0.8). **Arc is absent.**
- **Sponsorship on Arc:** ERC-4337 is supported, and Arc's AA toolbox lists Alchemy (Wallet
  APIs + gas sponsorship), Biconomy, Blockradar, Crossmint, Dynamic, MetaMask Embedded Wallets,
  Para, Pimlico, Privy, Thirdweb, Turnkey, Zerodev. Those can sponsor gas in USDC. Per-provider
  support/quality on Arc is **unverified**.
- **Implication for Payrail:** non-custodial dashboard users pay their own gas in USDC (no
  extra sponsor needed). Optional: later add Alchemy/Pimlico sponsorship for agent wallets.

---

## 7. Realistically quotable & swappable pairs today (mainnet)

| # | Pair (in → out) | Liquidity source | Liquidity | Verdict |
|---|---|---|---|---|
| 1 | **USDC → EURC** | Uniswap v4 (EURC/USDC, ~0.09%) | ~$454K / ~$542K vol | ✅ can quote & swap now |
| 2 | **EURC → USDC** | same v4 pool | same | ✅ can quote & swap now |
| 3 | **USDC → USDC (native send)** | no swap needed | n/a | ✅ batch transfer only |
| 4 | USDC → cirBTC | Uniswap v3 0.01% | ~$11.5M / ~$5.7M | ✅ but not a payout target for MVP |
| 5 | USDC → WETH | Uniswap v3 0.3% | ~$10.8M / ~$29.9M | ✅ but WETH wrapping semantics **unverified** on Arc |
| 6 | USDT / USDe / DAI / PYUSD ↔ anything | no pools | 0 | ❌ |
| 7 | USYC ↔ USDC | no pool; Teller allowlist | 0 | ❌ institutional-only |

---

## 8. MVP recommendation

**Pairs (2):**
1. **USDC → EURC** (and EURC → USDC) via Uniswap v4 — the actual FX-payout feature, has real
   liquidity and volume.
2. **USDC → USDC** native batch payout (no swap leg) — the core bulk-pay corpus.

**Sources (2, prioritized):**
1. **Uniswap v4 on Arc (primary)** — non-custodial by design: build swap calldata for the
   Universal Router (`0x8702…9250`), quote through V4 Quoter (`0x8dc1…f94`) or
   Uniswap API (needs key), no server-side funds. Best fit for "return unsigned tx for caller
   to sign".
2. **App Kit Swap via `estimateSwap` (secondary/fallback)** — quote-only + optional execution,
   managed by Circle; trades off some control for convenience. Requires Circle Console API key
   for volume use.

**Constraints honored in the design:**
- Gas: `maxFeePerGas ≥ 20 Gwei`, EIP-1559, fee estimates in USDC (18-dec), never assume 18 for
  ERC-20 balances (use `decimals()` / known 6).
- Contract math on 6-dec ERC-20 USDC; never mix `msg.value` with `balanceOf`.
- Arc runtime: blocklist reverts consume gas; value-to-zero reverts; EIP-7708 `Transfer` events
  from system emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`; finality after 1 block.

**Blocker list (must tell the user these are open):**
1. **EURC/USDC liquidity is modest (~$454K)** — enforce per-order max swap size + slippage cap;
   larger FX payouts may need to be split or matched in multiple quotes.
2. **StableFX is institution-gated** — no RFQ source available to us; pricing = AMM spot only.
3. **No USD-alternative stablecoin (USDT/DAI/PYUSD/USDe) liquidity on Arc** — "multi-currency"
   is effectively USDC ↔ EURC today.
4. **Uniswap "wrapped native" on Arc (`0x8bcEaA…`) is unverified** — if the product ever routes
   through WETH, confirm what that token actually is before approving.
5. **Circle Paymaster is not on Arc** — if we want sponsored gas for agent wallets, we must
   integrate an AA provider (Alchemy/Pimlico/…), which is out of MVP scope.
6. **Uniswap API quotes need an API key** — sign up on the Uniswap developer dashboard for
   production routing; on-chain V4 Quoter is the keyless fallback.
7. **Mainnet testnet discrepancy in docs (llms.txt says "Testnet only")** — baked into fleet
   docs; our CI must key off chain id 5042 vs 5042002 explicitly.

## Verification log
- RPC: `eth_chainId` → 5042 (mainnet), 5042002 (testnet) ✅
- Tokens: `decimals()`/`symbol()` called on mainnet for USDC, EURC, cirBTC, WETH, USYC ✅
- Uniswap: code presence on mainnet for PoolManager, UniversalRouter, V4Quoter, QuoterV2, V3
  factory ✅; deployed-at addresses for the rest taken from `deployments/5042.md` + explorer
- Pools: GeckoTerminal Arc network live liquidity/volume snapshot ✅
- StableFX/Paymaster: Circle dev-docs statements; not executable without a Circle institutional
  relationship (flagged, not verified by provisioning access)