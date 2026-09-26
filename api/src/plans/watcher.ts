/**
 * On-chain watcher: after the caller broadcasts a step tx, we poll for the
 * receipt, mark the step confirmed/failed, and flip the plan to final when
 * every step has a receipt.
 */

import type { Hex } from "viem";
import { getChain } from "../liquidity/chainConfig.js";
import type { PlanStore } from "./store.js";
import type { SseHub } from "./events.js";
import type { PlanState, PlanStepState } from "../http/planModel.js";
import type { Net } from "../net.js";
import type { SseEventParsed } from "../http/schemas/plan.js";

export interface WatcherDeps {
  net: Net;
  store: PlanStore;
  hub: SseHub;
}

export function submitStepState(
  state: PlanState,
  stepId: number,
  txHash: Hex,
  now = new Date().toISOString(),
): PlanState {
  const step = state.steps[stepId];
  if (!step) throw null;
  step.status = "submitted";
  step.txHash = txHash;
  step.submittedAt = now;
  step.explorerUrl = `${getChain(state.chain).explorerUrl}/tx/${txHash}`;
  state.status = "inProgress";
  state.updatedAt = now;
  return state;
}

/** Mark every completed step final; returns true when the plan is done. */
export function finalizeIfComplete(state: PlanState, now = new Date().toISOString()): boolean {
  const confirmedSteps = stepsWithStatus(state, "confirmed");
  const failedSteps = stepsWithStatus(state, "failed");
  if (confirmedSteps.length + failedSteps.length === state.steps.length) {
    state.status = failedSteps.length > 0 ? "failed" : "final";
    state.final = {
      confirmedSteps,
      failedSteps,
      txHashes: state.steps
        .map((s) => s.txHash)
        .filter((h): h is Hex => h != null),
    };
    state.updatedAt = now;
    return true;
  }
  return false;
}

export async function watchStep(deps: WatcherDeps, planId: string, stepId: number): Promise<void> {
  const state = deps.store.get(planId);
  if (!state || !state.steps[stepId]?.txHash) return;

  const txHash = state.steps[stepId].txHash!;
  let info;
  try {
    info = await deps.net.waitForTx(state.chain, txHash);
  } catch (e) {
    markStepFailed(deps, state, stepId, e instanceof Error ? e.message : String(e));
    emit(deps.hub, {
      type: "step.failed",
      data: { planId, stepId, txHash, error: e instanceof Error ? e.message : String(e) },
      ts: new Date().toISOString(),
    });
    return;
  }

  if (info.status !== "success") {
    markStepFailed(deps, state, stepId, `transaction reverted (status ${info.status})`);
    emit(deps.hub, {
      type: "step.failed",
      data: { planId, stepId, txHash, error: "transaction reverted" },
      ts: new Date().toISOString(),
    });
    return;
  }

  const now = new Date().toISOString();
  const step = state.steps[stepId]!;
  step.status = "confirmed";
  step.confirmedAt = now;
  state.updatedAt = now;
  deps.store.save(state);

  emit(deps.hub, {
    type: "step.confirmed",
    data: {
      planId,
      stepId,
      txHash,
      explorerUrl: step.explorerUrl ?? `${getChain(state.chain).explorerUrl}/tx/${txHash}`,
      gasUsedUsdc: (info.gasUsed * info.effectiveGasPrice).toString(),
    },
    ts: now,
  });

  if (finalizeIfComplete(state, now)) {
    deps.store.save(state);
    emit(deps.hub, {
      type: "plan.final",
      data: {
        planId,
        status: state.status === "failed" ? "failed" : "final",
        confirmedSteps: state.final!.confirmedSteps,
        failedSteps: state.final!.failedSteps,
        txHashes: state.final!.txHashes,
      },
      ts: now,
    });
  }
}

function markStepFailed(deps: WatcherDeps, state: PlanState, stepId: number, error: string): void {
  const step = state.steps[stepId];
  if (step) {
    step.status = "failed";
    step.failedError = error;
  }
  state.status = "failed";
  state.updatedAt = new Date().toISOString();
  deps.store.save(state);
}

function stepsWithStatus(state: PlanState, status: PlanStepState["status"]): number[] {
  return state.steps.filter((s) => s.status === status).map((s) => s.stepId);
}

function emit(hub: SseHub, event: SseEventParsed): void {
  hub.publish(event);
}