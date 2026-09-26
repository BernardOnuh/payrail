import { z } from "zod";
import { getChain } from "@payrail/api/liquidity";
import type { PayrailApiClient } from "../apiClient.js";
import type { McpConfigParsed } from "../config.js";
import { decimalsFor, humanAmount } from "../format.js";
import { okResult, type ToolResult } from "./result.js";

export const argsSchema = z.object({
  planId: z
    .string()
    .regex(/^plr_[a-zA-Z0-9]+$/, "planId must match plr_<id>")
    .describe("The plan ID returned by create_payout_plan (e.g. plr_xxxx)."),
});

export type GetPlanStatusArgs = z.output<typeof argsSchema>;

export function getPlanStatusDescription(chain: McpConfigParsed["chain"]): string {
  const gas = getChain(chain).gasToken;
  return [
    "Get the current status of a payout plan: step-by-step state (unsigned / submitted / confirmed / failed),",
    "transaction hashes and explorer links, and final totals.",
    "",
    "Units: sourceTokenSpent is in base units of the plan's source token",
    "  (USDC/EURC 6 decimals, cirBTC 8, WETH 18); feesUsdc is in native USDC at 18 decimals;",
    `  estimatedGasUsdc is in base units of the gas currency (${gas.symbol}, ${gas.decimals} decimals on ${chain}).`,
    chain === "basesepolia"
      ? "On Base Sepolia, wait for several confirmations (reorgs are possible)."
      : "On Arc, a transaction is final at the first receipt (deterministic finality, no reorgs).",
  ].join("\n");
}

export async function getPlanStatusHandler(
  api: PayrailApiClient,
  config: McpConfigParsed,
  args: GetPlanStatusArgs,
): Promise<ToolResult> {
  const state = await api.getPlan(args.planId);
  const dSrc = decimalsFor(config.chain, state.sourceToken as "USDC" | "EURC" | "cirBTC" | "WETH");

  return okResult({
    planId: state.planId,
    status: state.status,
    chain: state.chain,
    payer: state.payer,
    sourceToken: state.sourceToken,
    steps: state.steps.map((s) => ({
      stepId: s.stepId,
      type: s.type,
      status: s.status,
      description: s.description,
      txHash: s.txHash,
      explorerUrl: s.explorerUrl,
      failedError: s.failedError,
    })),
    totals: {
      sourceTokenSpent: humanAmount(state.totals.sourceTokenSpent, dSrc),
      sourceTokenSpentBaseUnits: state.totals.sourceTokenSpent,
      payoutsHuman: Object.fromEntries(
        Object.entries(state.totals.payouts).map(([k, v]) => [
          k,
          humanAmount(v, decimalsFor(config.chain, k as "USDC" | "EURC" | "cirBTC" | "WETH")),
        ]),
      ),
      feesUsdc: humanAmount(state.totals.feesUsdc, 18),
      estimatedGasUsdc: humanAmount(state.totals.estimatedGasUsdc, 18),
      gasToken: state.totals.gasToken ?? { symbol: getChain(config.chain).gasToken.symbol, decimals: 18 },
    },
    warnings: state.warnings,
    final: state.final,
    updatedAt: state.updatedAt,
  });
}