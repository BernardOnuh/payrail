"use client";

import { cx } from "@/lib/format";
import type { PlanLifecycle, StepStatus } from "@/lib/payrail/types";
import { Badge } from "./ui";

export function StatusDot({ status, className }: { status: StepStatus; className?: string }) {
  const cls: Record<StepStatus, string> = {
    unsigned: "bg-faint",
    submitted: "bg-amber",
    confirmed: "bg-mint",
    failed: "bg-danger",
  };
  return <span className={cx("inline-block size-2 rounded-full", cls[status], status === "submitted" && "animate-pulse", className)} aria-hidden="true" />;
}

export const STEP_STATUS: Record<StepStatus, { label: string; tone: "neutral" | "amber" | "accent" | "danger" }> = {
  unsigned: { label: "Unsigned", tone: "neutral" },
  submitted: { label: "Submitted", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "accent" },
  failed: { label: "Failed", tone: "danger" },
};

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const s = STEP_STATUS[status];
  return (
    <Badge tone={s.tone}>
      <StatusDot status={status} />
      {s.label}
    </Badge>
  );
}

export const PLAN_STATUS: Record<PlanLifecycle, { label: string; tone: "neutral" | "amber" | "accent" | "danger" | "mint" }> = {
  created: { label: "Created", tone: "neutral" },
  inProgress: { label: "In progress", tone: "amber" },
  final: { label: "Final", tone: "mint" },
  failed: { label: "Failed", tone: "danger" },
};

export function PlanStatusBadge({ status }: { status: PlanLifecycle }) {
  const s = PLAN_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ConnectionDot({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
      <span className="relative flex size-1.5" aria-hidden="true">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />}
        <span className={cx("relative inline-flex size-1.5 rounded-full", live ? "bg-mint" : "bg-faint")} />
      </span>
      {live ? "Live" : "Connecting"}
    </span>
  );
}