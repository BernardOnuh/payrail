import { z } from "zod";
import type { PayrailApiClient } from "../apiClient.js";
import type { McpConfigParsed } from "../config.js";
import { decimalsFor, humanAmount, quoteSummary, unitNote } from "../format.js";
import { okResult, type ToolResult } from "./result.js";

const tokenEnum = z.enum(["USDC", "EURC", "cirBTC", "WETH"]);

export const argsSchema = z.object({
  tokenIn: tokenEnum.describe(
    "Token to spend. One of USDC, EURC, cirBTC, WETH. USDC/EURC = 6 decimals, cirBTC = 8, WETH = 18.",
  ),
  tokenOut: tokenEnum.describe("Token to receive. Must differ from tokenIn."),
  amount: z
    .string()
    .regex(/^[0-9]+$/, "amount must be a non-negative integer string in base units")
    .describe(
      "Amount of tokenIn to spend, in BASE UNITS as a decimal string. " +
        "Examples: 1 USDC = \"1000000\", 0.5 EURC = \"500000\"; cirBTC uses 8 decimals, WETH 18. " +
        "Never send a decimal number like 1.5.",
    )
    .refine((s) => {
      try {
        return BigInt(s) > 0n;
      } catch {
        return false;
      }
    }, "amount must be greater than zero"),
  slippageBps: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .describe("Maximum acceptable slippage in basis points (default 50 = 0.5%)."),
}).refine((d) => d.tokenIn !== d.tokenOut, {
  message: "tokenIn and tokenOut must differ",
  path: ["tokenOut"],
});

export type GetQuoteArgs = z.output<typeof argsSchema>;

export function getQuoteDescription(): string {
  return [
    "Get a quote for a token-to-token swap through the Payrail API on the configured chain.",
    "Quotes are UNSIGNED and informational only: calling this tool never moves funds.",
    "",
    "Units: 'amount' is in BASE UNITS of tokenIn as a decimal string.",
    "  USDC and EURC: 6 decimals (1 USDC = \"1000000\"; 1 EURC = \"1000000\").",
    "  cirBTC: 8 decimals (1 cirBTC = \"100000000\").",
    "  WETH: 18 decimals (1 WETH = \"1000000000000000000\").",
    "Fees and estimated gas are in native USDC at 18 decimals.",
  ].join("\n");
}

export async function getQuoteHandler(
  api: PayrailApiClient,
  config: McpConfigParsed,
  args: GetQuoteArgs,
): Promise<ToolResult> {
  const din = decimalsFor(config.chain, args.tokenIn);
  const dout = decimalsFor(config.chain, args.tokenOut);

  const resp = await api.getQuote({
    chain: config.chain,
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amount: args.amount,
    slippageBps: args.slippageBps ?? config.defaultSlippageBps,
  });

  const best = quoteSummary(resp.best, din, dout);

  return okResult({
    chain: resp.chain,
    tokenIn: resp.tokenIn,
    tokenOut: resp.tokenOut,
    amountInBaseUnits: args.amount,
    amountInHuman: humanAmount(BigInt(args.amount), din),
    best,
    alternatives: resp.alternatives.map((a) => ({
      source: a.source,
      amountOut: humanAmount(a.amountOut, dout),
      amountOutBaseUnits: a.amountOut,
      estimatedFeeUsdc: humanAmount(a.estimatedFeeUsdc, 18),
      priceImpactBps: a.priceImpactBps,
    })),
    failedSources: resp.failed,
    units: { [args.tokenIn]: unitNote(args.tokenIn, din), [args.tokenOut]: unitNote(args.tokenOut, dout) },
    unsigned: true,
    reminder: "This is a quote only. No transaction was created or signed.",
  });
}