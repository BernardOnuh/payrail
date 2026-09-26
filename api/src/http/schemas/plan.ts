import { z } from "@hono/zod-openapi";
import {
  addressSchema,
  chainSchema,
  gasTokenSchema,
  hexTxHashSchema,
  isoDateTimeSchema,
  tokenSchema,
} from "./common.js";

export const stepStatusSchema = z.enum(["unsigned", "submitted", "confirmed", "failed"]);
export const planStatusSchema = z.enum(["created", "inProgress", "final", "failed"]);

const stepStateFields = z.object({
  stepId: z.number().int().min(0),
  status: stepStatusSchema,
  txHash: hexTxHashSchema.nullable().default(null),
  explorerUrl: z.string().url().nullable().default(null),
  submittedAt: isoDateTimeSchema.nullable().default(null),
  confirmedAt: isoDateTimeSchema.nullable().default(null),
  failedError: z.string().nullable().default(null),
});

/** A plan step plus its on-chain execution state. */
export const planStepStateSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("approve"),
      token: tokenSchema,
      spender: addressSchema,
      amount: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      tx: z.object({
        to: addressSchema,
        data: z.string().openapi({ type: "string" }),
        value: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      }),
      description: z.string(),
    })
    .merge(stepStateFields),
  z
    .object({
      type: z.literal("swap"),
      tokenIn: tokenSchema,
      tokenOut: tokenSchema,
      amountIn: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      amountOut: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      minAmountOut: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      source: z.string(),
      tx: z.object({
        to: addressSchema,
        data: z.string().openapi({ type: "string" }),
        value: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      }),
      description: z.string(),
    })
    .merge(stepStateFields),
  z
    .object({
      type: z.literal("batchPayout"),
      currency: tokenSchema,
      payouts: z.array(
        z.object({
          recipient: addressSchema,
          amount: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
        }),
      ),
      tx: z.object({
        to: addressSchema,
        data: z.string().openapi({ type: "string" }),
        value: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
      }),
      description: z.string(),
    })
    .merge(stepStateFields),
]).openapi("PlanStepState");

export const planStateSchema = z.object({
  planId: z.string().regex(/^plr_[0-9A-Za-z_-]+$/),
  status: planStatusSchema,
  chain: chainSchema,
  payer: addressSchema,
  sourceToken: tokenSchema,
  memo: z.string().max(280).nullable(),
  steps: z.array(planStepStateSchema),
  totals: z.object({
    sourceToken: tokenSchema,
    sourceTokenSpent: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
    payouts: z.record(tokenSchema, z.string().openapi({ type: "string", pattern: "^[0-9]+$" })),
    feesUsdc: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
    estimatedGasUsdc: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
    gasToken: gasTokenSchema,
  }),
  warnings: z.array(z.string()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  quoteExpiresAt: isoDateTimeSchema,
  final: z
    .object({
      confirmedSteps: z.array(z.number().int()),
      failedSteps: z.array(z.number().int()),
      txHashes: z.array(hexTxHashSchema),
    })
    .nullable()
    .default(null),
}).openapi("PlanState");

export type PlanStateParsed = z.output<typeof planStateSchema>;

/** Lightweight row for a recent-plans feed. */
export const recentPlanSchema = z.object({
  planId: z.string().regex(/^plr_[0-9A-Za-z_-]+$/),
  chain: chainSchema,
  sourceToken: tokenSchema,
  createdAt: isoDateTimeSchema,
  status: planStatusSchema,
  sourceTokenSpent: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }),
  memo: z.string().max(280).nullable(),
}).openapi("RecentPlan");

export type RecentPlanParsed = z.output<typeof recentPlanSchema>;

const minute = 60 * 1000;

export const submitStepSchema = z.object({
  stepId: z.number().int().min(0),
  txHash: hexTxHashSchema,
}).openapi("SubmitStep");

export const submitStepResponseSchema = z.object({
  ok: z.literal(true),
  planId: z.string(),
  stepId: z.number().int().min(0),
  status: stepStatusSchema,
  txHash: hexTxHashSchema,
  explorerUrl: z.string().url(),
}).openapi("SubmitStepResponse");

// ---------------------------------------------------------------------------
// SSE events (each emitted as `data: <json>\n\n`)
// ---------------------------------------------------------------------------

export type SseEventType =
  | "plan.created"
  | "step.submitted"
  | "step.confirmed"
  | "step.failed"
  | "plan.final";

export const sseEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plan.created"),
    data: planStateSchema,
    ts: isoDateTimeSchema,
  }),
  z.object({
    type: z.literal("step.submitted"),
    data: z.object({
      planId: z.string(),
      stepId: z.number().int().min(0),
      txHash: hexTxHashSchema,
      explorerUrl: z.string().url(),
    }),
    ts: isoDateTimeSchema,
  }),
  z.object({
    type: z.literal("step.confirmed"),
    data: z.object({
      planId: z.string(),
      stepId: z.number().int().min(0),
      txHash: hexTxHashSchema,
      explorerUrl: z.string().url(),
      gasUsedUsdc: z.string().openapi({ type: "string", pattern: "^[0-9]+$" }).optional(),
    }),
    ts: isoDateTimeSchema,
  }),
  z.object({
    type: z.literal("step.failed"),
    data: z.object({
      planId: z.string(),
      stepId: z.number().int().min(0),
      txHash: hexTxHashSchema.nullable(),
      error: z.string(),
    }),
    ts: isoDateTimeSchema,
  }),
  z.object({
    type: z.literal("plan.final"),
    data: z.object({
      planId: z.string(),
      status: z.enum(["final", "failed"]),
      confirmedSteps: z.array(z.number().int()),
      failedSteps: z.array(z.number().int()),
      txHashes: z.array(hexTxHashSchema),
    }),
    ts: isoDateTimeSchema,
  }),
]).openapi("SseEvent");

export type SseEventParsed = z.output<typeof sseEventSchema>;

/** Serialize an SSE event into the on-wire `data:` payload. */
export function sseData(event: SseEventParsed): string {
  return JSON.stringify(event);
}

/** SSE keepalive comment sent every interval to keep proxies from timing out. */
export function sseKeepalive(): string {
  return `: keepalive ${new Date().toISOString()}\n\n`;
}

export const SSE_RETRY_MS = 5_000;
export const SSE_HEARTBEAT_MS = minute / 2;
export const PLAN_TTL_MINUTES = 24 * 60;