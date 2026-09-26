import { z } from "@hono/zod-openapi";
import {
  addressSchema,
  amountSchema,
  chainSchema,
  gasTokenSchema,
  hexDataSchema,
  isoDateTimeSchema,
  requestIdSchema,
  tokenSchema,
  wireAmountSchema,
} from "./common.js";

/** Single payout leg: pay `amount` (base units of `currency`) to `recipient`. */
export const paymentSchema = z.object({
  recipient: addressSchema,
  amount: amountSchema,
  currency: tokenSchema,
}).openapi("Payment");

export type PaymentParsed = z.output<typeof paymentSchema>;

export const payoutRequestSchema = z
  .object({
    chain: chainSchema.default("mainnet"),
    payer: addressSchema,
    sourceToken: tokenSchema,
    memo: z.string().max(280).optional(),
    /** Up to 500 payments per request. */
    payments: z.array(paymentSchema).min(1).max(500),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.payments.forEach((p, i) => {
      const key = `${p.recipient}:${p.currency}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate payment: recipient ${p.recipient} has more than one payment in ${p.currency}`,
          path: ["payments", i],
        });
      }
      seen.add(key);
    });
  })
  .openapi("PayoutRequest");

export type PayoutRequestParsed = z.output<typeof payoutRequestSchema>;

export const planTxSchema = z.object({
  to: addressSchema,
  data: hexDataSchema,
  /** Native USDC (18-decimal) base units; 0 for ERC-20 swaps/batch payouts. */
  value: wireAmountSchema,
}).openapi("PlanTx");

export const payoutSchema = z.object({
  recipient: addressSchema,
  amount: wireAmountSchema.openapi({
    description: "Amount in base units of the payout currency.",
  }),
}).openapi("PayoutLeg");

export const planStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("approve"),
    token: tokenSchema,
    spender: addressSchema,
    /** 0n encoded as "0" means max uint256 approval. */
    amount: wireAmountSchema,
    tx: planTxSchema,
    description: z.string(),
  }),
  z.object({
    type: z.literal("swap"),
    tokenIn: tokenSchema,
    tokenOut: tokenSchema,
    amountIn: wireAmountSchema,
    amountOut: wireAmountSchema,
    minAmountOut: wireAmountSchema,
    source: z.string(),
    tx: planTxSchema,
    description: z.string(),
  }),
  z.object({
    type: z.literal("batchPayout"),
    currency: tokenSchema,
    payouts: z.array(payoutSchema).min(1),
    tx: planTxSchema,
    description: z.string(),
  }),
]).openapi("PlanStep");

export type PlanStepParsed = z.output<typeof planStepSchema>;

export const planTotalsSchema = z.object({
  sourceToken: tokenSchema,
  /** Total source token (base units) debited from the payer. */
  sourceTokenSpent: wireAmountSchema,
  /** Sum actually paid out to recipients, per currency (base units). */
  payouts: z.record(tokenSchema, wireAmountSchema),
  /** Total non-gas fees, native USDC (18-dec). */
  feesUsdc: wireAmountSchema,
  /** Estimated gas in `gasToken` base units (native USDC on Arc, ETH on Base). */
  estimatedGasUsdc: wireAmountSchema,
  /** Currency the wallet must hold for gas; also labels `estimatedGasUsdc`. */
  gasToken: gasTokenSchema,
}).openapi("PlanTotals");

export type PlanTotalsParsed = z.output<typeof planTotalsSchema>;

export const planSchema = z.object({
  planId: z.string().regex(/^plr_[0-9A-Za-z_-]+$/),
  createdAt: isoDateTimeSchema,
  chain: chainSchema,
  payer: addressSchema,
  sourceToken: tokenSchema,
  memo: z.string().max(280).nullable().default(null),
  steps: z.array(planStepSchema),
  totals: planTotalsSchema,
  /** The swap quote used to price non-source currencies expires at this instant. */
  quoteExpiresAt: isoDateTimeSchema,
  warnings: z.array(z.string()),
}).openapi("Plan");

export type PlanParsed = z.output<typeof planSchema>;

export const payoutResponseSchema = z.object({
  plan: planSchema,
  requestId: requestIdSchema,
}).openapi("PayoutResponse");

/** Live preview of a payout's totals before anything is signed or spent. */
export const estimateResponseSchema = z.object({
  chain: chainSchema,
  sourceToken: tokenSchema,
  /** Paid out to recipients, per currency (base units). */
  perCurrencyTotals: z.record(tokenSchema, wireAmountSchema),
  /** Source-token base units required (inputs + swap via quoted rates). */
  sourceNeeded: z.record(tokenSchema, wireAmountSchema),
  estimatedGasUsdc: wireAmountSchema,
  feesUsdc: wireAmountSchema,
  /** Currency the wallet must hold for gas; also labels `estimatedGasUsdc`. */
  gasToken: gasTokenSchema,
  stepsPreview: z.array(
    z.object({
      type: z.enum(["approve", "swap", "batchPayout"]),
      description: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
}).openapi("EstimateResponse");