import { z } from "@hono/zod-openapi";
import { getAddress, isAddress } from "viem";

export const CHAIN_KEYS = ["mainnet", "testnet"] as const;
export type ChainName = (typeof CHAIN_KEYS)[number];

export const TOKEN_KEYS = ["USDC", "EURC", "cirBTC", "WETH"] as const;
export type TokenName = (typeof TOKEN_KEYS)[number];

export const chainSchema = z.enum(CHAIN_KEYS).openapi({
  type: "string",
  enum: [...CHAIN_KEYS],
  description: "Arc chain. mainnet = 5042, testnet = 5042002.",
});

export const tokenSchema = z.enum(TOKEN_KEYS).openapi({
  type: "string",
  enum: [...TOKEN_KEYS],
  description: "Registered token key (addresses live in chainConfig, never in request bodies).",
});

export const slippageBpsSchema = z
  .number()
  .int()
  .min(1)
  .max(10_000)
  .openapi({ description: "Maximum accepted slippage, in basis points (1..10_000)." });

const bigintString = z
  .string()
  .refine((s) => /^[0-9]+$/.test(s), {
    message: "must be a non-negative integer string in base units",
  })
  .transform((s) => BigInt(s))
  .openapi({ type: "string", pattern: "^[0-9]+$", example: "1000000" });

export const nonNegativeAmountSchema = bigintString;

export const positiveAmountSchema = bigintString.refine((n) => n > 0n, {
  message: "must be greater than zero",
});

/**
 * Wire amount for RESPONSES: base-unit integer as a plain decimal string.
 * Kept as a string (no transform) so response objects serialize directly.
 */
export const wireAmountSchema = z
  .string()
  .refine((s) => /^[0-9]+$/.test(s), {
    message: "must be a non-negative integer string in base units",
  })
  .openapi({ type: "string", pattern: "^[0-9]+$", example: "1000000" });

/**
 * Token amounts in base units (USDC/EURC=6, cirBTC=8, WETH=18).
 * Value stays a bigint internally; wire format is a decimal string.
 */
export const amountSchema = positiveAmountSchema.openapi({
  description:
    "Token amount in base units (USDC/EURC=6 decimals, cirBTC=8, WETH=18), as a decimal string to preserve precision.",
});

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must look like a 20-byte EVM address")
  .refine((v) => isAddress(v), {
    message: "must be a valid EIP-55 checksummed address",
  })
  .transform((v) => getAddress(v))
  .openapi({
    type: "string",
    pattern: "^0x[0-9a-fA-F]{40}$",
    example: "0xBEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    description: "Checksummed EVM address (normalized on parse).",
  });

export const hexTxHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "txHash must be a 32-byte 0x hex string")
  .openapi({ type: "string", pattern: "^0x[0-9a-fA-F]{64}$" });

export const hexDataSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/, "calldata must be even-length 0x hex")
  .openapi({ type: "string", pattern: "^0x(?:[0-9a-fA-F]{2})*$" });

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .openapi({ type: "string", format: "date-time", example: "2026-09-24T21:00:00.000Z" });

/* ------------------------------------------------------------------ */
/* Consistent error envelope                                           */
/* ------------------------------------------------------------------ */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "POLICY_VIOLATION",
  "RATE_LIMITED",
  "QUOTE_FAILED",
  "QUOTE_EXPIRED",
  "PAYER_INSUFFICIENT_FUNDS",
  "NOT_FOUND",
  "STEP_NOT_FOUND",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const requestIdSchema = z
  .string()
  .regex(/^req_[0-9A-Za-z_-]+$/)
  .openapi({ type: "string", example: "req_01HZ9R..." });

export const errorDetailSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])).optional(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
  requestId: requestIdSchema,
}).openapi("ApiError");

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;