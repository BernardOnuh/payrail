# Payrail Agent Demo — screen-record script

Goal: show an AI agent (Claude Desktop over MCP) **quote a swap, plan a payout,
watch it confirm, and sign it** — while making crystal-clear the product is
**non-custodial**: the agent can *plan* but the API/MCP server never holds keys.

> Prerequisite: Payrail API quote/payout handlers are implemented (the schemas
> and OpenAPI spec are done; handlers/policies/watcher land in the next step).
> Record ~3–4 minutes, 1080p, macOS window. Narration is in the captions column.

## Setup before recording

1. `pnpm install` at the repo root.
2. Build: `pnpm --filter @payrail/api build && pnpm --filter @payrail/mcp build`.
3. Start Payrail API, set the fixture API key `payrail_demo_…` (see `api/.env.example`).
4. Fund the demo wallet on **testnet** from the Arc faucet (`https://faucet.circle.com`).
   Verify the balance with a direct RPC `eth_call` (e.g. `curl` against `rpc.testnet.arc.io`).
5. Launch MCP with signer enabled:
   `MCP_SIGNER_ENABLED=1 MCP_SIGNER_MAX_TOTAL_USDC=5000000 MCP_SIGNER_BROADCAST=1
   MCP_SIGNER_LOG_FILE=$TMPDIR/payrail-signatures.ndjson node mcp/dist/index.js`
   (keep its tab visible — the signature log on stderr is a screen highlight).

## Script

| # | What the operator does | What's on screen | Caption to narrate |
| --- | --- | --- | --- |
| 1 | **Open Payrail API** tab | `curl /health` → `{"status":"ok"}`, `GET /doc` JSON loads | "Payrail is the non-custodial payout API for agents on Arc." |
| 2 | **Create API key** | `api_key create` → the key + policy echoes back (max total per request, allowed tokens, max slippage, rate limit) | "Each agent key is a policy: cap per request, which tokens, max slippage, rate limit. The backend never holds a private key." |
| 3 | **Start MCP + Claude Desktop** | Desktop shows the `payrail` server connected; run `list_supported_tokens` directly | "The MCP server wraps the API for Claude. First, what can the agent pay in?" |
| 4 | **Tool: `list_supported_tokens`** | Result: USDC/EURC/cirBTC/WETH with addresses, decimals, and the USDC dual-decimals note | "USDC is native gas on Arc — 18 decimals natively, same balance via the ERC-20 view." |
| 5 | **Tool: `get_quote`** | Prompt: *"I want to swap 5 USDC into EURC for a vendor. Quote it for me with 0.5% slippage."* Result: best quote + alternative + fee in USDC | "The quote is informational only — no transaction, no signature, nothing moves." |
| 6 | **Tool: `create_payout_plan`** | Prompt: *"Plan a payout of 1.5 EURC to 0xAbCd… and 2 USDC to 0x1a2B…, funding from USDC, memo 'SWE-2026 invoice'."* Result: `planId plr_…`, `unsigned: true`, 3 steps (approve/swap/batchPayout), totals, warnings | "The agent 'plans' the payout. Steps are unsigned transactions. Payrail can't sign — only your wallet can." |
| 7 | **Tool: `get_plan_status`** | `status: created`, each step `unsigned`; show the totals human + base units | "Plan state is traceable per step — this is what a treasury agent verifies before signing." |
| 8 | **Refusal demo (optional but strong)** | Edit the plan to exceed the cap or change source to EURC; run `sign_plan` → `CAP_EXCEEDED` / `UNSUPPORTED_SOURCE` | "The demo signer refuses before touching the network: cap, payer mismatch, or non-USDC source." |
| 9 | **Tool: `sign_plan`** | Prompt: *"Sign plan plr_… with the demo wallet."* Result: steps signed; `broadcast: true`; tx hashes + explorer links; **signature log lines appear on stderr** | "One receipt = final on Arc (deterministic finality). Scroll the log: every signature is recorded — wallet, to, calldata, caps." |
| 10 | **Tool: `get_plan_status`** again | Steps now `confirmed`; `final` lists the tx hashes; open one in the explorer | "The agent sees the sweep complete on-chain, in a non-custodial flow end to end." |
| 11 | **Close with the key insight** | Show the whole tool list | "Quote, plan, verify, sign — the agent orchestrates; the user's wallet is the only authority." |

## Do's and don'ts (while recording)

- **Do** land on the "non-custodial" message every 2–3 steps; it's the pitch.
- **Do** keep the base-unit vs human distinction visible (5 USDC shows
  `"5000000"` base units + `5` human).
- **Don't** show a funded mainnet key, cap removal, or broadcast on mainnet.
- **Don't** narrate implementation details (framework, schemas) — this is a
  product demo.
- Keep captions under 12 words; the script above is the narrator's cheat sheet.

## Out-takes / alt segments

- **Rate-limit beat**: send the same request repeatedly; the API returns
  `RATE_LIMITED` after the key's `requestsPerMinute`.
- **Policy beat**: a second key limited to `maxTotalPerRequest=1000000` (1 USDC)
  → agent can't even *plan* a larger payout (`POLICY_VIOLATION`). Sharp contrast
  for risk teams.
- **Build/launch beat** (if recording setup): terminal shows `pnpm -r build`,
  then both servers boot — good for a fast-cut intro.

## After recording

- Verify `mcp/dist/index.js` runs standalone (`node mcp/dist/index.js` echoes
  the `[payrail-mcp] chain=… signerEnabled=…` line).
- Replace placeholder amounts/addresses in this doc's screen text with the real
  outputs from your run so captions match.