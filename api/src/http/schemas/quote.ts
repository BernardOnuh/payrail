import { z } from "@hono/zod-openapi";
import type { Quote, QuoteResult } from "../../liquidity/types.js";
import {
  amountSchema,
  chainSchema,
  requestIdSchema,
  slippageBpsSchema,
  tokenSchema,
  wireAmountSchema,
} from "./common.js";

export const quoteRequestSchema = z
  .object({
    chain: chainSchema.default("mainnet").openapi({ description: "Default: mainnet." }),
    tokenIn: tokenSchema,
    tokenOut: tokenSchema,
    amount: amountSchema,
    slippageBps: slippageBpsSchema,
  })
  .refine((d) => d.tokenIn !== d.tokenOut, {
    message: "tokenIn and tokenOut must differ",
    path: ["tokenOut"],
  })
  .openapi("QuoteRequest");

export type QuoteRequest = z.output<typeof quoteRequestSchema>;

export const quoteFeeSchema = z.object({
  type: z.enum(["provider", "gas", "network", "protocol"]),
  token: tokenSchema,
  amount: wireAmountSchema,
});

export const quoteSchema = z.object({
  source: z.string().describe("Source id, e.g. app-kit or uniswap-v4."),
  chain: chainSchema,
  tokenIn: tokenSchema,
  tokenOut: tokenSchema,
  amountIn: wireAmountSchema,
  amountOut: wireAmountSchema,
  minAmountOut: wireAmountSchema,
  /** Total estimated fee in native USDC (18-decimal) base units. */
  estimatedFeeUsdc: wireAmountSchema,
  /** Same fee expressed in tokenOut base units for cross-source comparison. */
  feeInOutput: wireAmountSchema,
  priceImpactBps: z.number().int().min(0).max(10_000),
  /** Unix seconds. Do not execute after this. */
  expiry: z.number().int(),
  fees: z.array(quoteFeeSchema),
  /** Source-specific payload consumed by a later buildSwapTx call. JSON-safe. */
  raw: z.unknown(),
}).openapi("Quote");

export const sourceFailureSchema = z.object({
  source: z.string(),
  error: z.string(),
});

export const quoteResponseSchema = z.object({
  chain: chainSchema,
  tokenIn: tokenSchema,
  tokenOut: tokenSchema,
  amountIn: wireAmountSchema,
  best: quoteSchema,
  alternatives: z.array(quoteSchema),
  failed: z.array(sourceFailureSchema),
  quoteExpiresAt: z.number().int().describe("Unix seconds; mirrors best.expiry."),
  requestId: requestIdSchema,
}).openapi("QuoteResponse");

export type QuoteResponseParsed = z.output<typeof quoteResponseSchema>;

/**
 * Serializes a domain QuoteResult (bigints) into the wire shape.
 * `raw` must already be JSON-safe.
 */
export function toQuoteResponse(
  result: QuoteResult,
  requestId: string,
): QuoteResponseParsed {
  const toWire = (q: Quote) => ({
    source: q.source,
    chain: q.chain,
    tokenIn: q.tokenIn,
    tokenOut: q.tokenOut,
    amountIn: q.amountIn.toString(),
    amountOut: q.amountOut.toString(),
    minAmountOut: q.minAmountOut.toString(),
    estimatedFeeUsdc: q.estimatedFeeUsdc.toString(),
    feeInOutput: q.feeInOutput.toString(),
    priceImpactBps: q.priceImpactBps,
    expiry: q.expiry,
    fees: q.fees.map((f) => ({ ...f, amount: f.amount.toString() })),
    raw: q.raw,
  });
  const { best, ...rest } = result;
  return {
    chain: best.chain,
    tokenIn: best.tokenIn,
    tokenOut: best.tokenOut,
    amountIn: best.amountIn.toString(),
    best: toWire(best),
    alternatives: rest.alternatives.map(toWire),
    failed: rest.failed,
    quoteExpiresAt: best.expiry,
    requestId,
  };
}