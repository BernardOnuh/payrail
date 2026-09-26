# Orion Builder Hackathon — Submission Packet

> Fill out the `TODO` boxes before submitting on https://orionagents.org/submit.
> Registration must come first (connect wallet + sign) so the submission wallet is whitelisted.

## Agent details

- **Agent name**: Payrail — Agent Payouts
- **Description** (min 50 chars): Payrail turns an AI agent's payout intent into a human-signed on-chain batch payment: no hot keys, no custody, multi-chain (Arc + Base). The agent builds a fully-quoted unsigned payout plan (fees, gas, slippage) that a wallet owner reviews and authorizes step-by-step from their own wallet—an approval flywheel that works today.
- **Target blockchain**: Base
- **Strategy**: Payments / Treasury (strategy select: pick "Other" and say agent payouts)
- **Category**: Tooling — or "Other" → autonomous payouts infrastructure
- **Revenue Sharing %**: TODO (propose 10)
- **Funding Target (USD)**: TODO (suggest 15,000)
- **Token Symbol (optional)**: — (no token yet; leave blank)

## Required links (all three are mandatory)

- **Website**: TODO — deploy web + api, then paste URL here
- **X/Twitter**: TODO (create/point @handle)
- **GitHub**: https://github.com/BernardOnuh/payrail
- **Discord or Telegram**: TODO (create a server, even a small one)

## Submitter

- **Email**: TODO
- **Wallet address**: TODO (must be the wallet you registered/sign with; Base wallet works — matches our chain)
- **Website URL**: same as above
- **Logo / Banner**: optional — generate a mint-on-dark square PNG (≤5MB) + banner

## Demo link (recommended)

TODO — deploy API + web and add `https://<host>/agent` (the MCP config page) and a
one-shot payout plan like `https://<host>/plans/plr_…` as proof it runs.
Include the MCP smoke commands for a judge to try in 1 minute:

```bash
# list chains/tokens with gas currency per chain
node payrail/mcp/dist/index.js   # then: list_supported_tokens
```

## Judging-fit notes

- **Works today**: live plans on Arc testnet and Base Sepolia (`plr_…` IDs verify via `/v1/plan/{id}`).
- **Any agent welcome**: this is an agent *infrastructure* built with MCP — the agent consumes quotable payouts without holding funds.
- **Safety story** (strong AI-vetting angle): unsigned plans + human authorization + capped demo signer + hashed API keys.
- **Multi-chain**: Base Sepolia live means target-blockchain "Base" is truthful.