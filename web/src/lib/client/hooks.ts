"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { countdownLabel, msUntil } from "@/lib/format";

/** True after hydration (client only) — for gating client-only UI. */
const emptySubscribe = () => () => {};
export function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export function useCountdownUntil(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!iso) return { msLeft: null, expired: false, label: "" };
  const msLeft = msUntil(iso, now);
  return { msLeft, expired: msLeft <= 0, label: countdownLabel(msLeft) };
}

export function usePlan(planId: string) {
  return useQuery({
    queryKey: ["plan", planId],
    queryFn: () => api.getPlan(planId),
    enabled: Boolean(planId),
    refetchInterval: (query) => {
      const state = query.state.data;
      return state && (state.status === "created" || state.status === "inProgress") ? 5000 : false;
    },
  });
}

export function usePlans() {
  return useQuery({ queryKey: ["plans"], queryFn: () => api.plans() });
}

export function useKeys() {
  return useQuery({ queryKey: ["keys"], queryFn: () => api.keys() });
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: 30_000 });
}