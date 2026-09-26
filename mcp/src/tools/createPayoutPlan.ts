import { z } from "zod";
import { isAddress, getAddress } from "viem";
import type { PayrailApiClient } from "../apiClient.js";
import type { McpConfigParsed } from "../config.js";
import { decimalsFor, humanAmount } from "../format.js";
import { errResult, okResult, type ToolResult } from "./result.js";

const tokenEnum = z.enum(["USDC", "EURC", "cirBTC", "WETH"]);

const paymentSchema = z
  .object({
    recipient: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "recipient must be a 20-byte 0x address")
      .refine((v) => isAddress(v), "recipient must be a valid EIP-55 checksummed address")
      .transform((v) => getAddress(v)),
    amount: z
      .string()
      .regex(/^[0-9]+$/, "amount must be a non-negative integer string in base units")
      .refine((s) => {
        try {
          return BigInt(s) > 0n;
        } catch {
          return false;
        }
      }, "amount must be greater than zero"),
    currency: tokenEnum.describe(
      "Payout currency. Note base units: USDC/EURC = 6 decimals, cirBTC = 8, WETH = 18.",
    ),
  })
  .describe(
    "One payout leg: pay `amount` (base units of `currency`) to `recipient`.",
  );

export const argsSchema = z
  .object({
    payments: z
      .array(paymentSchema)
      .min(1)
      .max(500)
      .describe("Payments to make. Each recipient may appear at most once per currency."),
    sourceToken: tokenEnum.describe(
      "Token the payer spends to fund all payments. Non-source currencies are swapped via the Plan Engine.",
    ),
    payer: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "payer must be a 20-byte 0x address")
      .refine((v) => isAddress(v), "payer must be a valid EIP-55 checksummed address")
      .transform((v) => getAddress(v))
      .optional()
      .describe(
        "Wallet that will sign the plan (checksummed 0x address). Optional when the demo signer is enabled; defaults to the signer wallet.",
      ),
    memo: z
      .string()
      .max(280)
      .optional()
      .describe("Optional memo attached to the plan for your records."),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.payments.forEach((p, i) => {
      const k = `${p.recipient}:${p.currency}`;
      if (seen.has(k)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate payment for ${p.currency} to ${p.recipient} (payment[${i}]); combine them or remove the duplicate`,
          path: ["payments", i],
        });
      }
      seen.add(k);
    });
  });

export type CreatePayoutPlanArgs = z.output<typeof argsSchema>;

export function createPayoutPlanDescription(): string {
  return [
    "Plan (do NOT execute) a batch payout from one sourceToken using the Payrail API.",
    "Returns an UNSIGNED plan: every step is an unsigned transaction (to/data/value) that a " +
      "wallet you control must sign and broadcast. Payrail never signs transactions.",
    "",
    "Behavior:",
    "  - Payments in sourceToken are batched into one batchPayout transaction.",
    "  - Payments in any other currency are funded by a swap step priced by the quote engine.",
    "  - The plan includes any required approval (approve) steps before swaps/payouts.",
    "",
    "Units: amounts are BASE UNITS strings (USDC/EURC 6 decimals, cirBTC 8, WETH 18).",
    "Example: [{\"recipient\":\"0x...\",\"amount\":\"2500000\",\"currency\":\"EURC\"}, " +
      "{\"recipient\":\"0x...\",\"amount\":\"5000000\",\"currency\":\"USDC\"}] with sourceToken USDC",
    "expects 1.0 USDC = \"1000000\" and 1.0 EURC = \"1000000\".",
  ].join("\n");
}

export async function createPayoutPlanHandler(
  api: PayrailApiClient,
  config: McpConfigParsed,
  args: CreatePayoutPlanArgs,
  opts: { defaultPayer?: `0x${string}` },
): Promise<ToolResult> {
  const payer = args.payer ?? opts.defaultPayer;
  if (!payer) {
    return errResult(
      "MISSING_PAYER",
      "No payer provided and the demo signer is disabled. Pass a `payer` (checksummed 0x address) or enable the signer.",
    );
  }

  const resp = await api.createPayoutPlan({
    chain: config.chain,
    payer,
    sourceToken: args.sourceToken,
    memo: args.memo,
    payments: args.payments.map((p) => ({
      recipient: p.recipient,
      amount: p.amount,
      currency: p.currency,
    })),
  });

  const plan = resp.plan;
  const dSrc = decimalsFor(config.chain, args.sourceToken);

  return okResult({
    planId: plan.planId,
    unsigned: true,
    note: "This plan is UNSIGNED. No funds moved. Sign the steps (e.g. via the sign_plan tool) before broadcasting.",
    chain: plan.chain,
    payer: plan.payer,
    sourceToken: plan.sourceToken,
    totals: {
      sourceTokenSpent: humanAmount(plan.totals.sourceTokenSpent, dSrc),
      sourceTokenSpentBaseUnits: plan.totals.sourceTokenSpent,
      payoutsHuman: Object.fromEntries(
        Object.entries(plan.totals.payouts).map(([k, v]) => [k, humanAmount(v, decimalsFor(config.chain, k as "USDC" | "EURC" | "cirBTC" | "WETH"))]),
      ),
      feesUsdc: humanAmount(plan.totals.feesUsdc, 18),
      estimatedGasUsdc: humanAmount(plan.totals.estimatedGasUsdc, 18),
    },
    steps: plan.steps.map((s) => ({
      type: s.type,
      description: s.description,
      to: s.tx.to,
      value: s.tx.value,
      calldataLength: Math.floor(s.tx.data.length / 2 - 1),
      calldataPrefix: s.tx.data.slice(0, 18),
    })),
    warnings: plan.warnings,
    quoteExpiresAt: plan.quoteExpiresAt,
    nextStep: "Call get_plan_status(planId) to watch it, and sign_plan(planId) to sign with the demo wallet (when enabled).",
  });
}