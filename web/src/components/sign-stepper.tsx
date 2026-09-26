"use client";

import { useEffect, useRef, useState } from "react";
import { parseGwei } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { api, ApiError } from "@/lib/client/api";
import { CHAIN_LABEL, CHAIN_SPEC, nameOfChainId } from "@/lib/registry";
import type { PlanState, StepState } from "@/lib/payrail/types";
import { Button, Card, CardTitle } from "./ui";
import { ConnectionDot, StatusDot } from "./status";

type StepOutcome = { stepId: number; status: StepState["status"]; txHash: `0x${string}` | null; error?: string };

export function SignStepper({ plan, onAllConfirmed }: { plan: PlanState; onAllConfirmed?: () => void }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const walletClient = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [running, setRunning] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const runningRef = useRef(false);

  const unsigned = plan.steps.filter((s) => s.status === "unsigned" || s.status === "failed");
  const signedCount = plan.steps.filter((s) => s.status === "submitted" || s.status === "confirmed").length;
  const noSteps = plan.steps.length === 0;

  const setOutcome = (stepId: number, patch: Partial<StepOutcome>) =>
    setOutcomes((prev) => {
      const idx = prev.findIndex((o) => o.stepId === stepId);
      const base: StepOutcome | undefined = prev[idx];
      if (base) {
        const next = [...prev];
        next[idx] = { ...base, ...patch, stepId };
        return next;
      }
      return [...prev, { ...patch, stepId } as StepOutcome];
    });

  useEffect(() => {
    if (signedCount > 0 && signedCount === plan.steps.length && plan.status !== "created") onAllConfirmed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedCount, plan.status]);

  if (!isConnected || !address) {
    return (
      <Card>
        <CardTitle title="Sign & send" aside={<ConnectionDot live={false} />} />
        <p className="text-[13.5px] text-muted">Connect a wallet on {plan.chain} to approve, swap and pay. Payrail never signs for you.</p>
      </Card>
    );
  }

  const currentChain = publicClient?.chain?.id;
  const targetName = plan.chain;
  const mismatch = currentChain != null && nameOfChainId(currentChain as number) !== targetName;

  const run = async () => {
    if (runningRef.current || !walletClient.data || !publicClient || !address) return;
    runningRef.current = true;
    setRunning(true);
    setFatal(null);
    try {
      const steps = plan.steps;
      for (const step of steps) {
        if (step.status === "confirmed" || step.status === "submitted") continue;
        if (!runningRef.current) break;

        setOutcome(step.stepId, { status: "submitted", error: undefined });
        const nativeValue = BigInt(step.tx.value);

        // 1) Sign.
        let txHash: `0x${string}`;
        try {
          let gas: bigint | undefined;
          try {
            gas = await publicClient.estimateGas({ account: address, to: step.tx.to, data: step.tx.data, value: nativeValue });
          } catch {
            gas = undefined;
          }
          txHash = await walletClient.data.sendTransaction({
            account: address,
            to: step.tx.to,
            data: step.tx.data,
            value: nativeValue,
            gas,
            maxFeePerGas: parseGwei(String(CHAIN_LABEL[targetName].minGasGwei)),
            maxPriorityFeePerGas: 0n,
          });
        } catch (e) {
          setOutcome(step.stepId, { status: "failed", error: e instanceof Error ? e.message : "Signature rejected." });
          setFatal("Signature rejected. Nothing was sent for this step.");
          break;
        }
        setOutcome(step.stepId, { status: "submitted", txHash });

        // 2) Report the hash so the API/observer can track it.
        try {
          await api.submitStep(plan.planId, { stepId: step.stepId, txHash });
        } catch (e) {
          setOutcome(step.stepId, { status: "failed", txHash, error: e instanceof ApiError ? e.message : "Could not report tx hash." });
          setFatal("Signed, but the API did not accept the tx hash. Contact support with the tx hash below.");
          break;
        }

        // 3) Wait for one receipt = final on Arc.
        try {
          await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 60_000 });
          setOutcome(step.stepId, { status: "confirmed", txHash });
        } catch {
          // Confirmation arrives via the live stream; don't fail the flow here.
          setOutcome(step.stepId, { status: "submitted", txHash });
        }
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardTitle title="Sign & send" aside={<ConnectionDot live={running} />} />
      {mismatch ? (
        <p className="mb-3 rounded-md border border-amber bg-ambersoft px-3 py-2 text-[12.5px] text-amber" role="alert">
          Wallet is on {nameOfChainId(currentChain as number) ?? `chain ${currentChain}`} · plan is on {targetName}.{" "}
          <Button
            variant="ghost"
            size="sm"
            className="!px-1"
            onClick={() => void switchChainAsync({ chainId: Number(CHAIN_SPEC[targetName].id) })}
          >
            Switch automatically
          </Button>
        </p>
      ) : null}
      {noSteps ? <p className="text-[13px] text-faint">No steps to sign.</p> : null}

      <ol className="space-y-2">
        {plan.steps.map((step) => {
          const o = outcomes.find((x) => x.stepId === step.stepId);
          const status = step.status === "confirmed" ? "confirmed" : step.status === "failed" ? "failed" : o?.status ?? "unsigned";
          const txHash = step.txHash ?? o?.txHash;
          return (
            <li key={step.stepId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface2/50 px-3 py-2">
              <div className="flex items-center gap-2.5">
                <StatusDot status={status} />
                <span className="font-mono text-[12px] text-muted">#{step.stepId + 1}</span>
                <span className="text-[12.5px] text-ink">{step.description}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11.5px]">
                {status === "confirmed" ? <span className="text-accent">Confirmed</span>
                : status === "failed" ? <span className="text-danger">Failed{txHash ? " (see below)" : ""}</span>
                : status === "submitted" ? <span className="animate-pulse text-amber">Submitted…</span>
                : <span className="text-faint">Waiting</span>}
                {txHash ? <a href={step.explorerUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{txHash.slice(0, 10)}…</a> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {fatal ? (
        <p className="mt-3 rounded-md border border-danger bg-dangersoft px-3 py-2 text-[12.5px] text-danger" role="alert">
          {fatal}
        </p>
      ) : null}

      <div className="mt-4">
        <Button size="lg" onClick={() => void run()} disabled={running || noSteps || unsigned.length === 0 || plan.status === "final" || plan.status === "failed"}>
          {running ? "Signing…" : unsigned.length === plan.steps.length ? "Sign and send" : "Continue signing"}
        </Button>
      </div>
    </Card>
  );
}