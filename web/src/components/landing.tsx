"use client";

import Link from "next/link";
import { useHealth } from "@/lib/client/hooks";
import { Badge, Card } from "./ui";

const STEPS = [
  {
    label: "1 · Compose",
    title: "List recipients",
    body: "Addresses, amounts and currencies — typed or pasted from a CSV. Live validation on every row.",
  },
  {
    label: "2 · Quote",
    title: "Price the flows",
    body: "The API quotes every swap leg against independent liquidity sources and bundles the plan.",
  },
  {
    label: "3 · Review",
    title: "Inspect the plan",
    body: "Approve, swap and batch-payout steps are laid out with targets, amounts and txs — nothing is signed.",
  },
  {
    label: "4 · Sign & settle",
    title: "Wallet signs, chain settles",
    body: "Your wallet walks each step; Payrail reports the tx hashes and tracks them to final (one receipt = final).",
  },
];

export function Landing() {
  const health = useHealth();

  return (
    <div className="space-y-12">
      <section className="mx-auto max-w-3xl pt-6 text-center sm:pt-12">
        <Badge tone="accent" className="mb-4">
          Non-custodial · built for AI agents · Arc
        </Badge>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Stablecoin payouts your wallets can sign —
          <br className="hidden sm:block" />{" "}
          <span className="text-accent">your agents can plan.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Payrail turns a list of recipients into a reviewed, unsigned set of treasury transactions — approvals, swaps
          and batch payouts — that a wallet you control signs, one by one, and that settle deterministically on Arc.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/payout"
            className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-medium text-accentink transition-opacity hover:opacity-90"
          >
            Start a payout
          </Link>
          <Link
            href="/agent"
            className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-5 text-[15px] font-medium text-ink transition-colors hover:border-linestrong"
          >
            Connect an agent
          </Link>
        </div>
        {health.data?.ok ? (
          <p className="mt-6 inline-flex items-center gap-2 text-[12px] text-faint">
            <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" />
            API online · {health.data.mode} mode
          </p>
        ) : null}
      </section>

      <section aria-label="How it works">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.label}>
              <Card className="h-full">
                <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-faint">{s.label}</p>
                <h2 className="mt-2 text-[15px] font-semibold">{s.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
        <div className="mx-auto mt-4 h-1 max-w-xl overflow-hidden rounded-full bg-surface2" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/50" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { title: "Never custodial", body: "The API returns unsigned txs. Backend keys only quote, plan and observe; signing stays in your wallet." },
          { title: "Deterministic finality", body: "Arc settles with one receipt. No reorg risk, no waiting games — the plan is final as fast as the chain confirms." },
          { title: "Policy at the edge", body: "Per-key caps, allowed tokens, max slippage and rate limits are enforced on every plan before anything is signed." },
        ].map((f) => (
          <Card key={f.title}>
            <h3 className="text-[14px] font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
          </Card>
        ))}
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold">Try it in sixty seconds</h3>
          <p className="mt-1 text-[13px] text-muted">Create a key, paste a payout and sign it — the web app runs on mock data until the API is up.</p>
        </div>
        <Link href="/keys" className="inline-flex h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium transition-colors hover:border-linestrong">
          Policy & keys →
        </Link>
      </Card>
    </div>
  );
}