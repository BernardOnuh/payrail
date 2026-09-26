# Payrail

Payrail is an AI-agent payouts rail. An agent picks who gets paid and how much;
Payrail turns that into a cryptographically **unsigned on-chain payout plan**
that a human approves from their own wallet — no hot keys, no custody.

Multi-chain today: **Arc testnet/mainnet** (native-USDC gas) and **Base Sepolia**
(ETH gas). The same plan flow runs on both.

## What's inside

| Package | What it is |
|---|---|
| `contracts/` | `PayrailRouter` — batch-sweep + payout contract (deployed to Arc testnet & Base Sepolia) |
| `api/` | Fastify HTTP API: quote, estimate, plan creation, submission, rate limits |
| `web/` | Next.js app: payout form, plan tracking, the `/agent` page |
| `mcp/` | MCP server — the agent-facing surface (`get_quote`, `create_payout_plan`, `get_plan_status`, `list_supported_tokens`) |
| `scripts/` | Deployment & pool-seeding scripts for the demo chains |

## How a payout flows

```
agent ──/v1/payout──▶ Payrail API ──▶ unsigned plan (quote, fees, steps)
                                           │
                              signer (MCP) │  broadcast (optional)
                                           ▼
  human wallet ◀── approve + batchPayout ── user's own wallet, multi-step
                                           ▼
                                      final plan
```

No signer ever custody funds: the payer is always the user's wallet. Agents
build the plan; humans authorize it.

## Quickstart

Requirements: Node 20+, pnpm 10.

```bash
pnpm install

# API
pnpm --filter @payrail/api build
# set api/.env from api/.env.example, then:
pnpm --filter @payrail/api dev

# Web
pnpm --filter @payrail/web dev   # http://localhost:4101

# MCP (agent)
pnpm --filter @payrail/mcp build
node payrail/mcp/dist/index.js   # stdio MCP server, PAYRAIL_MCP_CHAIN=testnet|basesepolia
```

## Agent setup

Point an MCP-host (Claude, etc.) at the built server. See `web/src/components/agent-panel.tsx` or `mcp/README.md` for a ready-to-paste config.

## Deployment

Two deployables: the **API** (stateless process + SQLite volume) and the **web**
(Next.js). They talk over HTTP; CORS is wide open for the demo.

### API — Railway (or any Docker host)

1. Give Railway this repo. The root `Dockerfile` + `railway.toml` run `node api/dist/main.js` (`/health` probe).
2. Set env vars (see `api/.env.example`): `PAYRAIL_PORT`, `PAYRAIL_DB_PATH` (point at a mounted volume, e.g. `/data/payrail.sqlite`), `PAYRAIL_OPERATOR_KEY`, `PAYRAIL_ROUTER_ADDRESS_TESTNET`, `PAYRAIL_ROUTER_ADDRESS_BASESEPOLIA`, `PUBLIC_API_URL`.
3. On any other host: `docker build -t payrail-api . && docker run -p 3033:3033 -e ... -v payrail-data:/data payrail-api`.

### Web — Vercel

1. Import the repo; Vercel auto-detects Next.js (`web/` is the project root).
2. Set env vars from `web/.env.example`:
   - `PAYRAIL_MODE=api`
   - `PAYRAIL_API_URL=https://<your-railway-url>`
   - `PAYRAIL_API_KEY=<key created on the /keys page>`
   - `NEXT_PUBLIC_CHAIN_*` (Arc mainnet/testnet + Base Sepolia RPCs/explorers)
   - `NEXT_PUBLIC_PAYRAIL_DEFAULT_CHAIN=testnet`
3. Deploy. Wallet connect uses site-injected wallets by default (RainbowKit placeholder `projectId`); add a real WalletConnect projectId to `web/src/lib/wagmi.ts` if you want QR/mobile connect.

## Security notes

- API keys are stored hashed (SHA-256); never recoverable.
- `.env*` is gitignored — secrets never enter the tree.
- The demo signer caps totals and only handles USDC-source plans; it is not a custody wallet.