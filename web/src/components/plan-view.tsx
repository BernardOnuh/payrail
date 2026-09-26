"use client";

import { useCountdownUntil } from "@/lib/client/hooks";
import { tokenFor } from "@/lib/registry";
import { cx, humanAmount, timeAgo, truncateAddress } from "@/lib/format";
import type { Plan, PlanStep, PlanStepState, StepState } from "@/lib/payrail/types";
import { Badge, Card, CardTitle, CopyButton } from "./ui";
import { PlanStatusBadge, StatusDot, STEP_STATUS } from "./status";

type StepView = PlanStep & Partial<StepState>;

function StepTypeBadge({ type }: { type: PlanStep["type"] }) {
  const label = { approve: "APPROVE", swap: "SWAP", batchPayout: "BATCH PAYOUT" }[type];
  const tone = { approve: "neutral", swap: "accent", batchPayout: "mint" }[type] as "neutral" | "accent" | "mint";
  return <Badge tone={tone}>{label}</Badge>;
}

function SwapDetail({ step, chain }: { step: Extract<PlanStep, { type: "swap" }>; chain: "mainnet" | "testnet" }) {
  const decIn = tokenFor(chain, step.tokenIn).decimals;
  const decOut = tokenFor(chain, step.tokenOut).decimals;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="mono-num">
        {humanAmount(step.amountIn, decIn)} {step.tokenIn}
      </span>
      <span className="text-faint" aria-hidden="true">→</span>
      <span className="mono-num font-medium">
        {humanAmount(step.amountOut, decOut)} {step.tokenOut}
      </span>
      <span className="text-faint">via {step.source}</span>
      <span className="text-faint">· min {humanAmount(step.minAmountOut, decOut)} {step.tokenOut}</span>
    </div>
  );
}

function BatchDetail({ step, chain }: { step: Extract<PlanStep, { type: "batchPayout" }>; chain: "mainnet" | "testnet" }) {
  const dec = tokenFor(chain, step.currency).decimals;
  const total = step.payouts.reduce((a, l) => a + BigInt(l.amount), 0n);
  return (
    <div>
      <p className="text-[12px] font-medium text-muted">
        {step.payouts.length} payout{step.payouts.length === 1 ? "" : "s"} · total{" "}
        <span className="mono-num text-ink">{humanAmount(total, dec)} {step.currency}</span>
      </p>
      {step.payouts.length <= 12 ? (
        <ul className="mt-2 space-y-1">
          {step.payouts.map((l) => (
            <li key={l.recipient} className="flex items-center justify-between gap-4 text-[12.5px]">
              <span className="truncate font-mono text-faint">{truncateAddress(l.recipient, 10, 6)}</span>
              <span className="mono-num text-ink">
                {humanAmount(l.amount, dec)} {step.currency}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-faint">
          Recipients summarized on the batch splitter; open on explorer after signing.
        </p>
      )}
    </div>
  );
}

function TxRow({ tx, chain }: { tx: PlanStep["tx"]; chain: "mainnet" | "testnet" }) {
  return (
    <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-faint">to</span>
        <code className="truncate font-mono text-muted">{truncateAddress(tx.to, 10, 6)}</code>
        <CopyButton value={tx.to} label="Copy contract address" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-faint">value</span>
        <span className="mono-num text-muted">{humanAmount(tx.value, 18)} USDC (native)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-faint">data</span>
        <code className="truncate font-mono text-muted">{tx.data === "0x" ? "0x (no call data)" : `${tx.data.slice(0, 14)}…`}</code>
        {tx.data !== "0x" ? <CopyButton value={tx.data} label="Copy call data" /> : null}
      </div>
    </div>
  );
}

export function PlanStepCard({ step, chain }: { step: StepView; chain: "mainnet" | "testnet" }) {
  const status: StepState["status"] = step.status ?? "unsigned";
  const st = STEP_STATUS[status];
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface2 font-mono text-[11px] text-muted">
            {(step.stepId ?? 0) + 1}
          </span>
          <StepTypeBadge type={step.type} />
          <StatusDot status={status} />
        </div>
        {status === "submitted" || status === "confirmed" || status === "failed" ? (
          step.explorerUrl ? (
            <a
              href={step.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11.5px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              {step.txHash ? truncateAddress(step.txHash, 10, 6) : step.explorerUrl}
            </a>
          ) : null
        ) : null}
      </div>

      <p className="mt-2 text-[13.5px] font-medium text-ink">{step.description}</p>

      {step.type === "approve" ? (
        <p className="mt-1 text-[12px] text-faint">
          Approve <span className="font-mono">{step.token}</span> for spender{" "}
          <span className="font-mono">{truncateAddress(step.spender, 10, 6)}</span>{" "}
          <span className="text-muted">(max uint256 &mdash; &quot;0&quot;)</span>
        </p>
      ) : null}
      {step.type === "swap" ? (
        <div className="mt-2">
          <SwapDetail step={step} chain={chain} />
        </div>
      ) : null}
      {step.type === "batchPayout" ? (
        <div className="mt-2">
          <BatchDetail step={step} chain={chain} />
        </div>
      ) : null}

      <TxRow tx={step.tx} chain={chain} />

      {status === "failed" ? (
        <p role="alert" className="mt-3 rounded-md border border-danger bg-dangersoft px-3 py-2 text-[12.5px] text-danger">
          {step.failedError ?? "Step failed"}
        </p>
      ) : null}
    </li>
  );
}

export function PlanView({ plan }: { plan: Plan | (Plan & { status?: PlanStepState["status"] }) }) {
  const chain = plan.chain;
  const { label: expiryLabel, expired } = useCountdownUntil(plan.quoteExpiresAt);
  const status: "created" | "inProgress" | "final" | "failed" | undefined = (plan as { status?: "created" | "inProgress" | "final" | "failed" }).status;

  const steps = plan.steps as StepView[];
  const totalSteps = steps.length;
  const signed = steps.filter((s) => (s.status ?? "unsigned") !== "unsigned").length;
  const confirmed = steps.filter((s) => s.status === "confirmed").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;

  const sourceMeta = tokenFor(chain, plan.totals.sourceToken);
  const spent = humanAmount(plan.totals.sourceTokenSpent, sourceMeta.decimals);
  const fees = humanAmount(plan.totals.feesUsdc, 18);
  const gas = humanAmount(plan.totals.estimatedGasUsdc, 18);

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-lg font-semibold">
            <span className="font-mono text-[15px]">{plan.planId}</span>
          </h1>
          <CopyButton value={plan.planId} label="Copy plan id" />
          {status ? <PlanStatusBadge status={status} /> : <Badge tone="neutral">Not signed</Badge>}
          <Badge tone={chain === "mainnet" ? "amber" : "neutral"}>{chain === "mainnet" ? "Mainnet" : "Testnet"}</Badge>
          <span className="ml-auto font-mono text-[11.5px] text-faint">{timeAgo(plan.createdAt)}</span>
        </div>

        <div className="grid gap-2 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl className="flex items-center justify-between gap-4">
            <dt className="text-muted">Payer</dt>
            <dd className="font-mono text-ink">{truncateAddress(plan.payer, 10, 6)}</dd>
          </dl>
          <dl className="flex items-center justify-between gap-4">
            <dt className="text-muted">Source</dt>
            <dd className="font-mono text-ink">{plan.totals.sourceToken}</dd>
          </dl>
          <dl className="flex items-center justify-between gap-4">
            <dt className="text-muted">Steps</dt>
            <dd className="mono-num text-ink">
              {signed}/{totalSteps} signed · {confirmed} confirmed{failedCount > 0 ? ` · ${failedCount} failed` : ""}
            </dd>
          </dl>
          <dl className="flex items-center justify-between gap-4">
            <dt className="text-muted">Quote expiry</dt>
            <dd className={cx("mono-num", expired ? "text-danger" : signed < totalSteps ? "text-amber" : "text-muted")}>
              {expired ? "expired" : expiryLabel}
            </dd>
          </dl>
        </div>

        {plan.memo ? <p className="mt-3 text-[13px] text-muted">“{plan.memo}”</p> : null}
      </Card>

      <Card>
        <CardTitle title="Totals" aside={<span className="text-[11.5px] text-faint">all amounts in base units on chain</span>} />
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Source to spend" value={`${spent} ${plan.totals.sourceToken}`} />
          <Stat
            label="Payouts"
            value={Object.entries(plan.totals.payouts)
              .map(([t, amt]) => `${humanAmount(amt ?? "0", tokenFor(chain, t as "USDC" | "EURC" | "cirBTC" | "WETH").decimals)} ${t}`)
              .join(" · ")}
          />
          <Stat label="Fees" value={`${fees} USDC`} />
          <Stat label="Est. gas" value={`${gas} USDC`} />
        </dl>
      </Card>

      {plan.warnings.length > 0 ? (
        <ul className="space-y-1.5 rounded-lg border border-amber/50 bg-ambersoft px-4 py-3">
          {plan.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-amber">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
                <path d="M12 3.5 21 20.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M12 10v4M12 16.6v.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <CardTitle title="Steps" />
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <PlanStepCard key={i} step={{ ...step, stepId: step.stepId ?? i }} chain={chain} />
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium tracking-wide text-faint">{label}</dt>
      <dd className="mono-num mt-1 break-words text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}