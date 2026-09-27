"use client";

import { Badge, Card, CardTitle, CopyButton } from "./ui";

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-surface2/80 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
      <code>{children}</code>
    </pre>
  );
}

function Snippet({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <CopyButton value={body} label={`Copy ${title}`} />
      </div>
      <Code>{body}</Code>
    </div>
  );
}

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "payrail": {
      "command": "node",
      "args": ["/Users/bernardo/Desktop/NewMe/payrail/mcp/dist/index.js"],
      "env": {
        "PAYRAIL_API_URL": "http://localhost:3033",
        "PAYRAIL_API_KEY": "<key from Policy & keys>",
        "PAYRAIL_MCP_CHAIN": "testnet"
      }
    }
  }
}`;

const QUOTE_CURL = `curl -s http://localhost:3033/v1/quote \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $PAYRAIL_API_KEY" \\
  -d '{
    "chain": "testnet",
    "tokenIn": "USDC",
    "tokenOut": "EURC",
    "amountIn": "1000000",
    "slippageBps": 50
  }'`;

const PAYOUT_CURL = `curl -s http://localhost:3033/v1/payout \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $PAYRAIL_API_KEY" \\
  -d '{
    "chain": "testnet",
    "payer": "0x959139C138Fa2925B86b1d5Db4785E8C35914439",
    "sourceToken": "USDC",
    "memo": "q3 contractors",
    "payments": [
      { "recipient": "0x959139C138Fa2925B86b1d5Db4785E8C35914439", "amount": "1000000", "currency": "USDC" }
    ]
  }'
# → returns an UNSIGNED plan. Sign the steps with a wallet you control,
#   then report each tx hash to /v1/plan/{id}/submitted.`;

const UNITS = `Amounts over the wire are base-unit strings, never floats:
- USDC / EURC: 6 decimals      -> 1 USDC = "1000000"
- cirBTC:      8 decimals      -> 1     = "100000000"
- WETH:       18 decimals      -> 1     = "1000000000000000000"
- fees: native USDC @ 18 decimals; estimated gas is in the chain's gas token
  (Arc: native USDC @ 18; Base Sepolia / Base: ETH @ 18).

Chains (PAYRAIL_MCP_CHAIN): testnet (Arc testnet, native-USDC gas) · mainnet
(Arc mainnet, real funds) · basesepolia (Base Sepolia, ETH gas) · base
(Base Mainnet, real ETH gas, USDC-only payouts). Arc finalizes on one receipt;
Base waits ~12 seconds.`;

export function AgentPanel() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">MCP</Badge>
        <Badge tone="accent">REST /v1</Badge>
        <p className="text-[13px] text-muted">Give an agent the same quoting + planning powers this dashboard uses.</p>
      </div>

      <Card>
        <CardTitle title="Connect the MCP server" aside={<Badge tone="neutral">Claude Desktop</Badge>} />
        <Snippet title="claude_desktop_config.json" body={CLAUDE_CONFIG} />
      </Card>

      <Card>
        <CardTitle title="Units & security model" aside={<Badge tone="neutral">read this, agents</Badge>} />
        <Snippet title="wire format" body={UNITS} />
        <p className="mt-3 text-[13px] text-muted">
          The backend and MCP server are <strong>non-custodial</strong>: keys only authorize quoting and planning.
          Signatures always come from the wallet you control. The demo signer (<code className="font-mono text-[12px]">sign_plan</code>)
          is capped and disabled by default.
        </p>
      </Card>

      <Card>
        <CardTitle title="HTTP API" aside={<Badge tone="neutral">curl</Badge>} />
        <div className="space-y-5">
          <Snippet title="Quote a swap" body={QUOTE_CURL} />
          <Snippet title="Create an unsigned payout plan" body={PAYOUT_CURL} />
        </div>
      </Card>

      <Card>
        <h3 className="text-[13px] font-semibold">MCP tools</h3>
        <ul className="mt-2 space-y-1 text-[13px] text-muted">
          <li><code className="font-mono text-[12px] text-ink">get_quote</code> — quote a swap. Informational only.</li>
          <li><code className="font-mono text-[12px] text-ink">create_payout_plan</code> — build an unsigned, policy-checked plan.</li>
          <li><code className="font-mono text-[12px] text-ink">get_plan_status</code> — step statuses, tx hashes, totals.</li>
          <li><code className="font-mono text-[12px] text-ink">list_supported_tokens</code> — tokens/addresses/decimals for the chain.</li>
          <li><code className="font-mono text-[12px] text-ink">sign_plan</code> — <em>demo only</em>, enabled by env, hard-capped.</li>
        </ul>
      </Card>
    </div>
  );
}