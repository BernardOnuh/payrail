/**
 * Builds an unsigned execution plan for a payout request.
 *
 * Step order (indexes ARE the on-chain execution order):
 *   0. approve      — source token -> router, amount = full source-token spend
 *   1..k-1. swap    — one swapExactIn per non-source-currency payment
 *   k. batchPayout  — one batchTransfer for all source-currency payments
 *
 * Swaps are exact-input, sized from `inputForExactOutput`, so the pool emits
 * EXACTLY the plan's amountOut (deterministic given static reserves; the plan
 * pins minAmountOut == amountOut). Multiple swap legs mutate a running reserve
 * tracker so later legs reflect earlier fills.
 */

import { encodeFunctionData } from "viem";
import { erc20Abi, payrailRouterAbi } from "../liquidity/abi.js";
import { getToken } from "../liquidity/chainConfig.js";
import { inputFee, inputForExactOutput, outputForExactInput } from "../liquidity/poolMath.js";
import { routerSourceName } from "../liquidity/sources/payrailRouter.js";
import { USDC_NATIVE_DECIMALS, type ChainKey, type Hex, type TokenKey } from "../liquidity/types.js";
import type { PayoutRequestParsed, PaymentParsed } from "../http/schemas/payout.js";
import type { DomainStep, Plan, PlanStepState, PlanState, PlanTotals } from "../http/planModel.js";
import type { Net } from "../net.js";
import { quoteFailed } from "../errors.js";

const SOURCE_TO_NATIVE_FACTOR = 10n ** BigInt(USDC_NATIVE_DECIMALS - 6); // 1e12 (6-dec -> 18-dec)
const GAS_MARGIN = 130n; // 1.30x on estimated gas

export interface BuildDeps {
  net: Net;
  routerAddress: Hex;
  /** Quote validity in seconds. 0 -> already expired (used by tests). */
  ttlSeconds: number;
}

export function planId(): string {
  const letters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += letters[bytes[i]! % letters.length];
  return `plr_${s}`;
}

interface Runner {
  reserve0: bigint;
  reserve1: bigint;
  feeBps: bigint;
  payerUsdcSpent: bigint;
  swapFeeUsdc: bigint;
  payouts: Partial<Record<TokenKey, bigint>>;
  warnings: string[];
  gasTotal: bigint;
}

export async function buildPlan(req: PayoutRequestParsed, deps: BuildDeps): Promise<Plan> {
  const chain = req.chain;
  const router = deps.routerAddress;
  const res = await deps.net.getRouterReserves(chain, router);
  if (!res.seeded || res.reserve0 === 0n || res.reserve1 === 0n) {
    throw quoteFailed("router pool not seeded", { chain, router });
  }

  const usdcInfo = getToken(chain, "USDC");
  const steps: DomainStep[] = [];
  const runner: Runner = {
    reserve0: res.reserve0,
    reserve1: res.reserve1,
    feeBps: res.feeBps,
    payerUsdcSpent: 0n,
    swapFeeUsdc: 0n,
    payouts: {},
    warnings: [],
    gasTotal: 0n,
  };

  // 1) swap legs first (deposit USDC into the pool, emit the output currency).
  for (const payment of req.payments) {
    if (payment.currency === req.sourceToken) continue;
    await appendSwapLeg(runner, steps, payment, chain, router, deps, req.payer);
  }

  // 2) source-token batch leg (one batchTransfer for every USDC payment).
  const nativePayments = req.payments.filter((p) => p.currency === req.sourceToken);
  if (nativePayments.length > 0) {
    const total = nativePayments.reduce((a, p) => a + p.amount, 0n);
    const data = encodeFunctionData({
      abi: payrailRouterAbi,
      functionName: "batchTransfer",
      args: [usdcInfo.address, nativePayments.map((p) => ({ to: p.recipient, amount: p.amount }))],
    });
    steps.push({
      type: "batchPayout",
      currency: req.sourceToken,
      payouts: nativePayments.map((p) => ({ recipient: p.recipient, amount: p.amount })),
      tx: { to: router, data, value: 0n },
      description: `Batch pay ${nativePayments.length} recipient(s) in ${req.sourceToken}`,
    });
    runner.payerUsdcSpent += total;
    runner.payouts[req.sourceToken] = (runner.payouts[req.sourceToken] ?? 0n) + total;
    runner.gasTotal += await estimateTx(deps, chain, req.payer, router, data);
  }

  // 3) approve leg goes first so every later pull is funded by one pre-approval.
  const approveAmount = runner.payerUsdcSpent;
  if (approveAmount > 0n) {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [router, approveAmount],
    });
    steps.unshift({
      type: "approve",
      token: req.sourceToken,
      spender: router,
      amount: approveAmount,
      tx: { to: usdcInfo.address, data, value: 0n },
      description: `Approve ${req.sourceToken} to router for plan execution`,
    });
    runner.gasTotal += await estimateTx(deps, chain, req.payer, usdcInfo.address, data);
  }

  // 4) gas estimate in native USDC (18-dec): gas * basefee(wei) * margin.
  const baseFeeGwei = await deps.net.baseFeeGwei(chain);
  const estimatedGasUsdc = runner.gasTotal * GAS_MARGIN * baseFeeGwei * 1_000_000_000n;

  const totals: PlanTotals = {
    sourceToken: req.sourceToken,
    sourceTokenSpent: runner.payerUsdcSpent,
    payouts: runner.payouts,
    feesUsdc: runner.swapFeeUsdc * SOURCE_TO_NATIVE_FACTOR,
    estimatedGasUsdc,
  };

  const nowMs = Date.now();
  return {
    planId: planId(),
    createdAt: new Date(nowMs).toISOString(),
    chain,
    payer: req.payer,
    sourceToken: req.sourceToken,
    memo: req.memo?.trim() ? req.memo.trim() : null,
    steps,
    totals,
    quoteExpiresAt: new Date(nowMs + deps.ttlSeconds * 1000).toISOString(),
    warnings: runner.warnings,
  };
}

/** Attach immutable plan data to a fresh execution state (all steps unsigned). */
export function toPlanState(plan: Plan, updatedAt = plan.createdAt): PlanState {
  const steps: PlanStepState[] = plan.steps.map((s, i) => ({
    ...s,
    stepId: i,
    status: "unsigned",
    txHash: null,
    explorerUrl: null,
    submittedAt: null,
    confirmedAt: null,
    failedError: null,
  }));
  return {
    planId: plan.planId,
    status: "created",
    chain: plan.chain,
    payer: plan.payer,
    sourceToken: plan.sourceToken,
    memo: plan.memo,
    steps,
    totals: plan.totals,
    warnings: plan.warnings,
    createdAt: plan.createdAt,
    updatedAt,
    quoteExpiresAt: plan.quoteExpiresAt,
    final: null,
  };
}

/* ------------------------------------------------------------------ */

async function appendSwapLeg(
  runner: Runner,
  steps: DomainStep[],
  payment: PaymentParsed,
  chain: ChainKey,
  router: Hex,
  deps: BuildDeps,
  payer: Hex,
): Promise<void> {
  if (runner.reserve1 <= payment.amount) {
    throw quoteFailed("insufficient pool liquidity for this payout", {
      tokenOut: payment.currency,
      amount: payment.amount.toString(),
    });
  }
  const in6 = inputForExactOutput(runner.reserve0, runner.reserve1, payment.amount, runner.feeBps);
  if (in6 == null) {
    throw quoteFailed("insufficient pool liquidity for this payout", {
      tokenOut: payment.currency,
      amount: payment.amount.toString(),
    });
  }
  const amountOut = outputForExactInput(runner.reserve0, runner.reserve1, in6, runner.feeBps);

  const data = encodeFunctionData({
    abi: payrailRouterAbi,
    functionName: "swapExactIn",
    args: [in6, amountOut, payment.recipient],
  });

  steps.push({
    type: "swap",
    tokenIn: "USDC",
    tokenOut: payment.currency,
    amountIn: in6,
    amountOut,
    minAmountOut: amountOut,
    source: routerSourceName,
    tx: { to: router, data, value: 0n },
    description: `Swap USDC → ${payment.currency} for ${payment.recipient}`,
  });

  runner.reserve0 += in6;
  runner.reserve1 -= amountOut;
  runner.payerUsdcSpent += in6;
  runner.swapFeeUsdc += inputFee(in6, runner.feeBps);
  runner.payouts[payment.currency] = (runner.payouts[payment.currency] ?? 0n) + amountOut;
  runner.gasTotal += await estimateTx(deps, chain, payer, router, data);
}

async function estimateTx(deps: BuildDeps, chain: ChainKey, from: Hex, to: Hex, data: Hex): Promise<bigint> {
  try {
    return await deps.net.estimateGas(chain, from, to, data, 0n);
  } catch {
    return 0n; // unprecisable steps skip the margin; funding is pre-checked anyway
  }
}