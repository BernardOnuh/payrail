"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { humanAmount, timeAgo, toBaseUnits } from "@/lib/format";
import type { ApiKeyPolicy, ApiKeyView, CreateKeyResponse } from "@/lib/payrail/types";
import { Button, Card, CardTitle, CopyButton, EmptyState, Skeleton } from "./ui";
import { Field, TextInput, Toggle } from "./field";
import { Badge } from "./ui";
import { useKeys } from "@/lib/client/hooks";

const TOKEN_OPTIONS = ["USDC", "EURC", "cirBTC", "WETH"] as const;
const tokenLabel: Record<string, string> = { USDC: "USDC", EURC: "EURC", cirBTC: "cirBTC", WETH: "WETH" };

function emptyPolicy(): ApiKeyPolicy {
  return { name: "", maxTotalPerRequest: "100000000", allowedTokens: ["USDC", "EURC"], maxSlippageBps: 50, requestsPerMinute: 30 };
}

export function KeysPanel() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useKeys();
  const [draft, setDraft] = useState<ApiKeyPolicy>(emptyPolicy());
  const [maxTotalHuman, setMaxTotalHuman] = useState("100.00");
  const [maxTotalError, setMaxTotalError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<CreateKeyResponse | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      let base = 0n;
      try {
        base = toBaseUnits(maxTotalHuman, 6);
      } catch (e) {
        setMaxTotalError(e instanceof RangeError ? e.message : "Invalid cap.");
        throw new Error("cap");
      }
      if (base <= 0n) {
        setMaxTotalError("Cap must be positive.");
        throw new Error("cap");
      }
      const policy: ApiKeyPolicy = { ...draft, maxTotalPerRequest: base.toString() };
      return api.createKey(policy);
    },
    onSuccess: (key) => {
      setJustCreated(key);
      setDraft(emptyPolicy());
      setMaxTotalHuman("100.00");
      setMaxTotalError(null);
      void qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "cap") setJustCreated(null);
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.revokeKey(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["keys"] }),
  });

  const toggleToken = (t: (typeof TOKEN_OPTIONS)[number]) =>
    setDraft((d) => ({
      ...d,
      allowedTokens: d.allowedTokens.includes(t) ? d.allowedTokens.filter((x) => x !== t) : [...d.allowedTokens, t],
    }));

  return (
    <div className="space-y-6">
      {justCreated ? (
        <Card className="border-accent/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Badge tone="mint">Key created</Badge> shown once
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setJustCreated(null)}>
              Dismiss
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface2 px-3 py-2">
            <code className="font-mono text-[13px] text-ink">{justCreated.apiKey}</code>
            <CopyButton value={justCreated.apiKey} label="Copy API key" />
          </div>
          <p className="mt-2 text-[12.5px] text-muted">
            Keep it server-side. Only the SHA-256 hash is stored; we can never show it again. Prefix keys usable in HTTP calls:{" "}
            <code className="font-mono">X-API-Key: {justCreated.apiKey}</code>.
          </p>
        </Card>
      ) : null}

      <Card>
        <CardTitle title="Create an API key" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" htmlFor="key-name" hint="e.g. “CI payout bot”">
            <TextInput id="key-name" value={draft.name} placeholder="Name the key" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </Field>
          <Field label="Max total per request (USDC)" htmlFor="key-cap" error={maxTotalError} hint="Per-request cap on the total USD value (in USDC base units on the wire).">
            <TextInput id="key-cap" value={maxTotalHuman} inputMode="decimal" className="mono-num" onChange={(e) => { setMaxTotalHuman(e.target.value); setMaxTotalError(null); }} />
          </Field>
          <Field label="Allowed tokens" htmlFor="key-tokens" hint="Restrict which currencies plans may pay out.">
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Allowed tokens">
              {TOKEN_OPTIONS.map((t) => {
                const on = draft.allowedTokens.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleToken(t)}
                    className={`inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] transition-colors ${
                      on ? "border-accent/50 bg-accentsoft text-accent" : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {tokenLabel[t]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Max slippage" htmlFor="key-slippage" hint="Basis points the plan may tolerate on swaps (default 50 = 0.5%).">
            <TextInput
              id="key-slippage"
              type="number"
              min={1}
              max={1000}
              value={draft.maxSlippageBps}
              onChange={(e) => setDraft((d) => ({ ...d, maxSlippageBps: Math.max(1, Math.min(1000, Number(e.target.value) || 50)) }))}
              className="mono-num"
            />
          </Field>
          <Field label="Rate limit" htmlFor="key-rate" hint="Requests per minute on this key.">
            <TextInput
              id="key-rate"
              type="number"
              min={1}
              max={10000}
              value={draft.requestsPerMinute}
              onChange={(e) => setDraft((d) => ({ ...d, requestsPerMinute: Math.max(1, Math.min(10000, Number(e.target.value) || 30)) }))}
              className="mono-num"
            />
          </Field>
        </div>
        {createMut.isError && !(createMut.error instanceof Error && createMut.error.message === "cap") ? (
          <p className="mt-3 rounded-md border border-danger bg-dangersoft px-3 py-2 text-[12.5px] text-danger" role="alert">
            {createMut.error instanceof ApiError ? createMut.error.message : "Failed to create the key."}
          </p>
        ) : null}
        <div className="mt-4">
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !draft.name.trim()}>
            {createMut.isPending ? "Creating…" : "Create API key"}
          </Button>
        </div>
      </Card>

      <KeysList keys={data} isLoading={isLoading} isError={isError} error={error} onRevoke={(id) => revokeMut.mutate(id)} revoking={revokeMut.isPending} />
    </div>
  );
}

function KeysList({ keys, isLoading, isError, error, onRevoke, revoking }: {
  keys?: ApiKeyView[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardTitle title="Keys" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }
  const list = keys ?? [];
  if (isError) return <Card><p className="text-[13px] text-danger">{error?.message ?? "Could not load keys."}</p></Card>;
  if (list.length === 0) return <EmptyState title="No keys yet" description="Keys authorize quote + plan calls. Signing always stays in the wallet you control." />;

  return (
    <Card>
      <CardTitle title="Keys" />
      <ul className="divide-y divide-line">
        {list.map((k) => (
          <KeyRow key={k.id} keyView={k} onRevoke={onRevoke} revoking={revoking} />
        ))}
      </ul>
    </Card>
  );
}

function KeyRow({ keyView, onRevoke, revoking }: { keyView: ApiKeyView; onRevoke: (id: string) => void; revoking: boolean }) {
  const revoked = keyView.revokedAt != null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium text-ink">{keyView.name || "Unnamed key"}</span>
          {revoked ? <Badge tone="neutral">Revoked</Badge> : <Badge tone="accent">Active</Badge>}
          <span className="font-mono text-[11.5px] text-faint">{keyView.id}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          Cap <span className="mono-num">{humanAmount(keyView.policy.maxTotalPerRequest, 6)} USDC</span> · slippage{" "}
          <span className="mono-num">{keyView.policy.maxSlippageBps}</span> bps ·{" "}
          <span className="mono-num">{keyView.policy.requestsPerMinute}</span> req/min · tokens{" "}
          {keyView.policy.allowedTokens.join(", ")} · created {timeAgo(keyView.createdAt)}
        </p>
      </div>
      {!revoked ? (
        <Button variant="danger" size="sm" disabled={revoking} onClick={() => onRevoke(keyView.id)}>
          Revoke
        </Button>
      ) : null}
    </li>
  );
}