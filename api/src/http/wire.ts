/**
 * Domain (bigint) -> wire (decimal string) for plan payloads.
 */

import type { PlanState } from "./planModel.js";
import type { PlanStateParsed } from "./schemas/plan.js";
import type { TokenName } from "./schemas/common.js";

export function planStateToWire(s: PlanState): PlanStateParsed {
  return {
    planId: s.planId,
    status: s.status,
    chain: s.chain,
    payer: s.payer,
    sourceToken: s.sourceToken,
    memo: s.memo,
    steps: s.steps.map((st) => {
      const base = {
        stepId: st.stepId,
        status: st.status,
        txHash: st.txHash,
        explorerUrl: st.explorerUrl,
        submittedAt: st.submittedAt,
        confirmedAt: st.confirmedAt,
        failedError: st.failedError,
      };
      switch (st.type) {
        case "approve":
          return {
            ...base,
            type: "approve" as const,
            token: st.token,
            spender: st.spender,
            amount: st.amount.toString(),
            tx: { to: st.tx.to, data: st.tx.data, value: st.tx.value.toString() },
            description: st.description,
          };
        case "swap":
          return {
            ...base,
            type: "swap" as const,
            tokenIn: st.tokenIn,
            tokenOut: st.tokenOut,
            amountIn: st.amountIn.toString(),
            amountOut: st.amountOut.toString(),
            minAmountOut: st.minAmountOut.toString(),
            source: st.source,
            tx: { to: st.tx.to, data: st.tx.data, value: st.tx.value.toString() },
            description: st.description,
          };
        case "batchPayout":
          return {
            ...base,
            type: "batchPayout" as const,
            currency: st.currency,
            payouts: st.payouts.map((p) => ({ recipient: p.recipient, amount: p.amount.toString() })),
            tx: { to: st.tx.to, data: st.tx.data, value: st.tx.value.toString() },
            description: st.description,
          };
      }
    }),
    totals: {
      sourceToken: s.totals.sourceToken,
      sourceTokenSpent: s.totals.sourceTokenSpent.toString(),
      payouts: Object.fromEntries(
        Object.entries(s.totals.payouts).map(([k, v]) => [k, v.toString()]),
      ) as Record<TokenName, string>,
      feesUsdc: s.totals.feesUsdc.toString(),
      estimatedGasUsdc: s.totals.estimatedGasUsdc.toString(),
      gasToken: { symbol: s.totals.gasToken.symbol, decimals: s.totals.gasToken.decimals },
    },
    warnings: s.warnings,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    quoteExpiresAt: s.quoteExpiresAt,
    final: s.final,
  };
}