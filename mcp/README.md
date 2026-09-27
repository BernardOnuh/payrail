# Payrail MCP server

Model Context Protocol server that lets AI agents quote swaps and **plan** (not
execute) stablecoin payouts through the Payrail API on Arc — non-custodially:
the server never holds or signs keys by default.

## Tools

| Tool | Description |
| --- | --- |
| `get_quote` | Quote a token→token swap. **Informational only, never moves funds.** |
| `create_payout_plan` | Build an **unsigned** payout plan (steps are `to/data/value` txs a wallet you control signs). |
| `get_plan_status` | Step-by-step plan status, tx hashes, explorer links, totals. |
| `list_supported_tokens` | Tokens/addresses/decimals for the configured chain. |
| `sign_plan` *(only when enabled)* | **Demo/dev only**: sign plan steps with a dedicated, **capped** demo wallet. |

## Units (read this, agents)

- **USDC / EURC: 6 decimals** — 1 USDC = `"1000000"`, 1 EURC = `"1000000"`.
- **cirBTC: 8 decimals** — 1 cirBTC = `"100000000"`.
- **WETH: 18 decimals** — 1 WETH = `"1000000000000000000"`.
- Fees and estimated gas are in **native USDC at 18 decimals**.
- USDC on Arc is the native gas token (18 decimals); its ERC-20 view at
  `0x3600…0000` shares the same balance (6-decimals view).
- All amounts over the wire are **base-unit decimal strings** — never floats.

## Configuration (env)

| Env | Default | Meaning |
| --- | --- | --- |
| `PAYRAIL_API_URL` | `http://localhost:3000` | Payrail HTTP API base URL |
| `PAYRAIL_API_KEY` | — | Payrail API key (`X-API-Key`); required by quote/plan tools |
| `PAYRAIL_MCP_CHAIN` | `testnet` | `testnet`, `mainnet`, `basesepolia`, or `base` |
| `PAYRAIL_MCP_SLIPPAGE_BPS` | `50` | Default slippage for quotes (basis points) |
| `MCP_SIGNER_ENABLED` | `false` | Enable the optional demo signer (`sign_plan` tool) |
| `MCP_SIGNER_PRIVATE_KEY` | — | Demo wallet key. **Never a funded key.** |
| `MCP_SIGNER_MAX_TOTAL_USDC` | — | Signing cap in **USDC base units** (6 decimals). Required when enabled. |
| `MCP_SIGNER_BROADCAST` | `false` | When `1`, signed steps are broadcast and awaited (1 receipt = final on Arc) |
| `MCP_SIGNER_LOG_FILE` | — | Optional NDJSON file; every signature is appended |
| `PAYRAIL_MCP_SLIPPAGE_BPS` | `50` | Default quote slippage |

See `.env.example`.

## Build & test

```bash
pnpm --filter @payrail/api build   # workspace dependency
pnpm --filter @payrail/mcp install
pnpm --filter @payrail/mcp build
pnpm --filter @payrail/mcp test    # vitest: arg validation + signer cap/log
```

## Run

```bash
PAYRAIL_API_KEY=<key> PAYRAIL_MCP_CHAIN=testnet node mcp/dist/index.js
```

or from the `mcp/` package:

```bash
pnpm --filter @payrail/mcp start
```

The server speaks MCP over stdio. Start the Payrail API first
(`pnpm --filter @payrail/api start`) and create an API key.

### Chains

| `PAYRAIL_MCP_CHAIN` | Network | Gas | Funds |
| --- | --- | --- | --- |
| `testnet` | Arc testnet (5042002) | native USDC | faucet testnet USDC |
| `mainnet` | Arc mainnet (5042) | native USDC | real USDC (CCTP) |
| `basesepolia` | Base Sepolia (84532) | ETH | Base Sepolia faucets |
| `base` | Base Mainnet (8453) | ETH | real ETH + native USDC |

Arc finalizes on one receipt; Base waits ~12 seconds.

### Claude Desktop

`claude_desktop_config.json` → mcpServers:

```json
{
  "mcpServers": {
    "payrail": {
      "command": "node",
      "args": ["/absolute/path/to/NewMe/mcp/dist/index.js"],
      "env": {
        "PAYRAIL_API_URL": "http://localhost:3000",
        "PAYRAIL_API_KEY": "<key from Payrail API>",
        "PAYRAIL_MCP_CHAIN": "testnet"
      }
    }
  }
}
```

### Claude Code

`~/.claude.json` (or project `.mcp.json`):

```json
{
  "mcpServers": {
    "payrail": {
      "command": "node",
      "args": ["/absolute/path/to/NewMe/mcp/dist/index.js"],
      "env": {
        "PAYRAIL_API_URL": "http://localhost:3000",
        "PAYRAIL_API_KEY": "<key>",
        "PAYRAIL_MCP_CHAIN": "testnet"
      }
    }
  }
}
```

## The demo signer (`sign_plan`)

Registered **only** when `MCP_SIGNER_ENABLED=true`. It signs a plan's steps with
the derived demo wallet and **refuses** (before any RPC call) when:

- the plan sources from anything other than USDC (USDC is native gas),
- the plan payer is not the demo wallet,
- the plan total (`totals.sourceTokenSpent`) exceeds `MCP_SIGNER_MAX_TOTAL_USDC`
  — the cap is checked **before** any network interaction.

Every signature is recorded: stderr + `MCP_SIGNER_LOG_FILE` (NDJSON). Never run
this with a funded production key.

## Security model

- Backend and MCP server are **non-custodial**: API keys authorize *quoting and
  planning*; signatures come from a wallet you control.
- The API enforces per-key policies (max total per request, allowed tokens, max
  slippage, rate limit) on `create_payout_plan`.
- Deterministic finality on Arc: one receipt = final (no reorg risk).