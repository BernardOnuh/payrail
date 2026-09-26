"use client";

import Link from "next/link";
import { useCountdownUntil, usePlan } from "@/lib/client/hooks";
import { usePlanStream } from "./plan-stream";
import { PlanView } from "./plan-view";
import { SignStepper } from "./sign-stepper";
import { Badge, Button, Card, EmptyState, Skeleton } from "./ui";
import { tokenFor } from "@/lib/registry";
import { humanAmount } from "@/lib/format";
import type { PlanState } from "@/lib/payrail/types";

export function PlanPage({ planId, initialPlan = null }: { planId: string; initialPlan?: PlanState | null }) {
  const planQuery = usePlan(planId);
  const plan = planQuery.data ?? initialPlan;

  const liveEnabled = Boolean(plan && plan.status !== "final" && plan.status !== "failed");
  const { snapshot, connection } = usePlanStream(liveEnabled ? planId : undefined, liveEnabled, plan ?? null);

  const current = snapshot ?? plan;
  const isLive = connection === "live" && current?.status === "inProgress";
  const loading = planQuery.isLoading && !plan;
  const failed = planQuery.isError && !plan;

  if (loading) return <PlanSkeleton />;
  if (failed || !current) {
    return (
      <EmptyState
        title="Plan not found"
        description={planQuery.error instanceof Error ? planQuery.error.message : "This plan doesn't exist (or the API is unreachable)."}
        action={
          <Link
            href="/plans"
            className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-linestrong"
          >
            Back to plans
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {plan && plan.status === "created" ? <QuoteExpiryBanner plan={plan} /> : null}
      {isLive ? <LivePill /> : null}
      <PlanView plan={current} />
      <SignStepper plan={current} />
      <PlanOutcome plan={current} />
    </div>
  );
}

function QuoteExpiryBanner({ plan }: { plan: PlanState }) {
  const { expired, label } = useCountdownUntil(plan.quoteExpiresAt);
  if (!expired) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber bg-ambersoft px-4 py-3" role="alert">
      <div>
        <p className="text-[13px] font-semibold text-amber">Quote expired</p>
        <p className="text-[12.5px] text-muted">
          A fresh quote is needed before signing. Rebuild the payout to get new rates and a new expiry{" "}
          <span className="mono-num">({label})</span>.
        </p>
      </div>
      <Button variant="secondary" size="sm">
        <Link href="/payout">Rebuild payout</Link>
      </Button>
    </div>
  );
}

function LivePill() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted w-fit">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-mint" />
      </span>
      Tracking on-chain… one receipt = final
    </div>
  );
}

function PlanOutcome({ plan }: { plan: PlanState }) {
  const final = plan.final;
  if (plan.status !== "final") return null;
  const paid = Object.entries(plan.totals.payouts)
    .map(([t, a]) => `${humanAmount(a ?? "0", tokenFor(plan.chain, t as "USDC" | "EURC" | "cirBTC" | "WETH").decimals)} ${t}`)
    .join(" · ");
  return (
    <Card className="border-mint/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Badge tone="mint">Plan final</Badge> {paid}
          </h3>
          <p className="mt-1 text-[13px] text-muted">All steps confirmed on-chain. No reorgs on Arc — finality is immediate on one receipt.</p>
        </div>
        <Button variant="secondary" size="sm">
          <Link href="/payout">Create another payout</Link>
        </Button>
      </div>
      {final && final.txHashes.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {final.txHashes.map((h, i) => (
            <li key={h} className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className="text-faint">tx #{i + 1}</span>
              <a
                href={`https://explorer.${plan.chain}.arc.io/tx/${h}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-accent underline decoration-accent/40 underline-offset-2"
              >
                {h}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <Skeleton className="h-6 w-56" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Card>
      <Card>
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    </div>
  );
}