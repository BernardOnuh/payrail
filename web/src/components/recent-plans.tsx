"use client";

import Link from "next/link";
import { usePlans } from "@/lib/client/hooks";
import { chainDisplayName, tokenFor } from "@/lib/registry";
import { humanAmount, timeAgo, truncateAddress } from "@/lib/format";
import { Card, CardTitle, EmptyState, Skeleton } from "./ui";
import { PlanStatusBadge } from "./status";
import type { RecentPlan } from "@/lib/payrail/types";

export function RecentPlans({ title = "Recent plans" }: { title?: string }) {
  const { data, isLoading, isError, error, refetch } = usePlans();

  if (isLoading) {
    return (
      <Card>
        <CardTitle title={title} />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardTitle title={title} />
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-danger">{error instanceof Error ? error.message : "Could not load plans."}</p>
          <button type="button" onClick={() => void refetch()} className="text-[13px] font-medium text-accent underline underline-offset-2">
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="No plans yet"
        description="Create your first payout and it will appear here with live status."
        action={
          <Link
            href="/payout"
            className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accentink"
          >
            New payout
          </Link>
        }
      />
    );
  }

  return (
    <Card>
      <CardTitle title={title} aside={<span className="mono-num text-[12px] text-faint">{data.length}</span>} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-105 text-left">
          <caption className="sr-only">Recent payout plans</caption>
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-faint">
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Chain</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 text-right font-medium">Spent</th>
              <th className="py-2 pr-3 font-medium">Memo</th>
              <th className="py-2 text-right font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <PlanRow key={p.planId} plan={p} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlanRow({ plan }: { plan: RecentPlan }) {
  const dec = tokenFor(plan.chain, plan.sourceToken).decimals;
  return (
    <tr className="border-b border-line/70 text-[13px] last:border-0 hover:bg-surface2/40">
      <td className="py-2.5 pr-3">
        <Link href={`/plans/${plan.planId}`} className="font-mono text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          {truncateAddress(plan.planId, 8, 4)}
        </Link>
      </td>
      <td className="py-2.5 pr-3">
        <PlanStatusBadge status={plan.status} />
      </td>
      <td className="py-2.5 pr-3 font-mono text-muted">{chainDisplayName(plan.chain)}</td>
      <td className="py-2.5 pr-3 font-mono text-muted">{plan.sourceToken}</td>
      <td className="py-2.5 pr-3 text-right mono-num">
        {humanAmount(plan.sourceTokenSpent, dec)} {plan.sourceToken}
      </td>
      <td className="max-w-40 truncate py-2.5 pr-3 text-muted">{plan.memo ?? "—"}</td>
      <td className="py-2.5 text-right font-mono text-[12px] text-faint">{timeAgo(plan.createdAt)}</td>
    </tr>
  );
}