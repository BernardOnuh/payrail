"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { PlanState, SseEvent } from "@/lib/payrail/types";

export type StreamConnection = "connecting" | "live" | "error" | "closed";

/** Apply a single SSE event to a plan snapshot in place. */
function applyEvent(ev: SseEvent, base: PlanState): PlanState {
  switch (ev.type) {
    case "plan.created":
      return ev.data;
    case "step.submitted":
      return {
        ...base,
        steps: base.steps.map((s) =>
          s.stepId === ev.data.stepId
            ? {
                ...s,
                status: "submitted",
                txHash: ev.data.txHash,
                explorerUrl: ev.data.explorerUrl,
                submittedAt: new Date(ev.ts).toISOString(),
              }
            : s,
        ),
      };
    case "step.confirmed":
      return {
        ...base,
        steps: base.steps.map((s) =>
          s.stepId === ev.data.stepId
            ? {
                ...s,
                status: "confirmed",
                submittedAt: s.submittedAt ?? new Date(ev.ts).toISOString(),
                confirmedAt: new Date(ev.ts).toISOString(),
              }
            : s,
        ),
      };
    case "step.failed":
      return {
        ...base,
        steps: base.steps.map((s) =>
          s.stepId === ev.data.stepId ? { ...s, status: "failed", failedError: ev.data.error, txHash: ev.data.txHash ?? s.txHash } : s,
        ),
      };
    case "plan.final":
      return { ...base, status: ev.data.status };
  }
}

/**
 * Live plan state for a screen: seeds with `initial`, then subscribes to the
 * `/api/stream/:id` SSE endpoint and replays events on top. Reconnects are
 * handled by the browser EventSource; a final event closes it for good.
 */
export function usePlanStream(planId: string | undefined, enabled: boolean, initial: PlanState | null) {
  const [snapshot, setSnapshot] = useState<PlanState | null>(initial);
  const [connection, setConnection] = useState<StreamConnection>("connecting");
  const replays = useRef<PlanState | null>(initial);
  const closedRef = useRef(false);

  useEffect(() => {
    replays.current = initial ?? null;
  }, [initial]);

  useEffect(() => {
    if (!planId || !enabled) return;

    let disposed = false;
    closedRef.current = false;
    const es = new EventSource(api.streamUrl(planId));

    es.onopen = () => {
      if (!disposed) setConnection("live");
    };
    es.onmessage = (msg) => {
      if (disposed) return;
      try {
        const ev = JSON.parse(msg.data) as SseEvent;
        const base = replays.current;
        if (!base) return; // seed not loaded yet; rely on polling
        const next = applyEvent(ev, base);
        replays.current = next;
        setSnapshot(next);
        if (ev.type === "plan.final") {
          closedRef.current = true;
          es.close();
          setConnection("closed");
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      if (disposed) return;
      if (es.readyState === EventSource.CLOSED) {
        setConnection("closed");
      } else {
        setConnection("error");
      }
    };

    return () => {
      disposed = true;
      es.close();
    };
  }, [planId, enabled]);

  const end = () => {
    setConnection("closed");
  };

  return { snapshot, connection, end, closed: connection === "closed", reconnected: connection === "error" };
}