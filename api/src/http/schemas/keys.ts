import { z } from "@hono/zod-openapi";
import {
  nonNegativeAmountSchema,
  requestIdSchema,
  slippageBpsSchema,
  tokenSchema,
} from "./common.js";

/**
 * API key policy. `maxTotalPerRequest` is denominated in USDC base units
 * (6 decimals): the cap on the total USD value of one request, where amounts
 * in other currencies are converted through the quoted swap rate.
 */
export const apiKeyPolicySchema = z.object({
  name: z.string().min(1).max(64),
  maxTotalPerRequest: nonNegativeAmountSchema,
  allowedTokens: z.array(tokenSchema).min(1),
  maxSlippageBps: slippageBpsSchema,
  requestsPerMinute: z.number().int().min(1).max(10_000),
});

export type ApiKeyPolicy = z.output<typeof apiKeyPolicySchema>;

/** Public representation of a key (never contains the raw or hashed key). */
export const apiKeyViewSchema = z.object({
  id: z.string().regex(/^k_[0-9A-Za-z_-]+$/),
  name: z.string(),
  policy: apiKeyPolicySchema,
  createdAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
});

export type ApiKeyView = z.output<typeof apiKeyViewSchema>;

/** Row as stored in SQLite. */
export interface ApiKeyRecord {
  id: string;
  name: string;
  /** sha256 hex of the raw key; the raw key is never stored. */
  hashedKey: string;
  policyJson: string;
  createdAt: string;
  revokedAt: string | null;
}

export const createApiKeyResponseSchema = z.object({
  apiKeyId: requestIdSchema.regex(/^k_[0-9A-Za-z_-]+$/),
  /** Shown exactly once at creation. */
  apiKey: z.string().min(20),
  policy: apiKeyPolicySchema,
});