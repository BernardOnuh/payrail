/**
 * HTTP handlers (OpenAPIHono). Every amount is serialized as a decimal string;
 * errors use the standard envelope and are converted in app.ts onError.
 */

import type { OpenAPIHono } from "@hono/zod-openapi";
import type { QuoteEngine } from "../liquidity/engine.js";
import type { Net } from "../net.js";
import { routerAddressFor } from "../net.js";
import { toQuoteResponse } from "./schemas/quote.js";
import type { PayoutRequestParsed } from "./schemas/payout.js";
import { planStateToWire } from "./wire.js";
import type { ApiKeyPolicy, ApiKeyView } from "./schemas/keys.js";
import type { PlanState } from "./planModel.js";
import { sseData, sseKeepalive, SSE_HEARTBEAT_MS, type SseEventParsed } from "./schemas/plan.js";
import type { PlanStore } from "../plans/store.js";
import type { SseHub } from "../plans/events.js";
import { buildPlan, toPlanState, type BuildDeps } from "../plans/builder.js";
import { submitStepState, watchStep } from "../plans/watcher.js";
import {
  forbidden,
  notFound,
  payerInsufficientFunds,
  policyViolation,
  quoteExpired,
  quoteFailed,
  stepNotFound,
} from "../errors.js";
import type { KeyService } from "../keys/service.js";
import { sha256Hex } from "../keys/store.js";
import {
  createKeyRoute,
  estimateRoute,
  healthRoute,
  listKeysRoute,
  listPlansRoute,
  payoutRoute,
  planRoute,
  quoteRoute,
  revokeKeyRoute,
  streamRoute,
  submitStepRoute,
} from "./routes.js";

export interface AppServices {
  keys: KeyService;
  store: PlanStore;
  hub: SseHub;
  net: Net;
  engine: QuoteEngine;
  /** Quote validity window in seconds. */
  ttlSeconds(): number;
  /** sha256 hex of the operator key; management endpoints require it. */
  operatorKeyHash: string;
}

export type AppEnv = {
  Variables: { services: AppServices };
};

export function newRequestId(): string {
  const letters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += letters[bytes[i]! % letters.length];
  return `req_${s}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- openapi() couples route
   schemas to handler types; both sides are pre-validated at runtime. */
/* eslint-disable @typescript-eslint/no-unused-vars */

export function installHandlers(app: OpenAPIHono<AppEnv>): void {
  app.openapi(healthRoute as any, async (c: any) => {
    return c.json({ ok: true, chain: "testnet", version: "0.1.0", uptimeSec: Math.floor(process.uptime()) }, 200);
  });

  app.openapi(quoteRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    const body = c.req.valid("json") as {
      chain: string;
      tokenIn: string;
      tokenOut: string;
      amount: bigint;
      slippageBps: number;
    };
    const policy = services.keys.authenticate(c.req.header("X-API-Key")).record.policy;

    if (body.slippageBps > policy.maxSlippageBps) {
      throw policyViolation("slippage exceeds the key's policy cap", {
        slippageBps: body.slippageBps,
        cap: policy.maxSlippageBps,
      });
    }
    services.keys.assertTokensAllowed(policy, [body.tokenIn as never, body.tokenOut as never]);

    const result = await services.engine.getQuote({
      chain: body.chain as never,
      tokenIn: body.tokenIn as never,
      tokenOut: body.tokenOut as never,
      amountIn: body.amount,
      slippageBps: body.slippageBps,
    });
    return c.json(toQuoteResponse(result, newRequestId()), 200);
  });

  app.openapi(estimateRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    const body = c.req.valid("json") as PayoutRequestParsed;
    const policy = services.keys.authenticate(c.req.header("X-API-Key")).record.policy;

    const router = routerAddressFor(body.chain as never);
    if (!router) throw quoteFailed("PayrailRouter not deployed for this chain", { chain: body.chain });

    const deps: BuildDeps = { net: services.net, routerAddress: router, ttlSeconds: services.ttlSeconds() };
    const plan = await buildPlan(body, deps);

    // Same policy surface as /v1/payout, minus the funding precheck.
    enforcePolicy(services, policy, body, plan.totals.sourceTokenSpent);

    return c.json(
      {
        chain: plan.chain,
        sourceToken: plan.sourceToken,
        perCurrencyTotals: Object.fromEntries(
          Object.entries(plan.totals.payouts).map(([k, v]) => [k, v.toString()]),
        ),
        sourceNeeded: { [plan.sourceToken]: plan.totals.sourceTokenSpent.toString() },
        estimatedGasUsdc: plan.totals.estimatedGasUsdc.toString(),
        feesUsdc: plan.totals.feesUsdc.toString(),
        stepsPreview: plan.steps.map((s) => ({ type: s.type, description: s.description })),
        warnings: plan.warnings,
      },
      200,
    );
  });

  app.openapi(payoutRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    const body = c.req.valid("json") as PayoutRequestParsed;
    const policy = services.keys.authenticate(c.req.header("X-API-Key")).record.policy;

    const router = routerAddressFor(body.chain as never);
    if (!router) throw quoteFailed("PayrailRouter not deployed for this chain", { chain: body.chain });

    const deps: BuildDeps = { net: services.net, routerAddress: router, ttlSeconds: services.ttlSeconds() };
    const plan = await buildPlan(body, deps);
    const state = toPlanState(plan);

    enforcePolicy(services, policy, body, state.totals.sourceTokenSpent);
    await checkFunding(services, body, state.totals.sourceTokenSpent, state.totals.estimatedGasUsdc);

    services.store.save(state);
    services.hub.publish({ type: "plan.created", data: planStateToWire(state), ts: state.createdAt });

    return c.json({ plan: planStateToWire(state), requestId: newRequestId() }, 200);
  });

  app.openapi(planRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    services.keys.authenticate(c.req.header("X-API-Key"));
    const { id } = c.req.valid("param") as { id: string };
    const state = services.store.get(id);
    if (!state) throw notFound("plan not found");
    return c.json(planStateToWire(state), 200);
  });

  app.openapi(streamRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    services.keys.authenticate(c.req.header("X-API-Key"));
    const { id } = c.req.valid("param") as { id: string };
    if (!services.store.get(id)) throw notFound("plan not found");

    // Streaming SSE via a raw ReadableStream. hono/streaming's streamSSE +
    // @hono/node-server does not flush bytes in this adapter combo, so we
    // push encoded frames directly and let the node adapter stream the body.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(sseKeepalive()));
          } catch {
            clearInterval(heartbeat);
          }
        }, SSE_HEARTBEAT_MS);
        const unsubscribe = services.hub.subscribe(id, (event: SseEventParsed) => {
          const frame = `event: ${event.type}\ndata: ${sseData(event)}\nid: ${event.type}\n\n`;
          try {
            controller.enqueue(new TextEncoder().encode(frame));
          } catch {
            /* consumer gone */
          }
        });
        const cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
        };
        c.req.raw.signal.addEventListener("abort", cleanup);
      },
    });

    return c.body(stream, 200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  });

  app.openapi(submitStepRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    services.keys.authenticate(c.req.header("X-API-Key"));
    const { id } = c.req.valid("param") as { id: string };
    const { stepId, txHash } = c.req.valid("json") as { stepId: number; txHash: `0x${string}` };

    const state = services.store.get(id);
    if (!state) throw notFound("plan not found");
    const step = state.steps[stepId];
    if (!step) throw stepNotFound(`step ${stepId}`);

    if (state.status === "final" || state.status === "failed") {
      throw policyViolation(`plan already ${state.status}`);
    }
    if (Date.now() > new Date(state.quoteExpiresAt).getTime()) {
      throw quoteExpired();
    }
    // Sequential execution: every earlier step must already be confirmed.
    for (let i = 0; i < stepId; i++) {
      const prior = state.steps[i];
      if (!prior) throw stepNotFound(`step ${i}`);
      if (prior.status !== "confirmed") {
        throw policyViolation(`step ${i} must be confirmed before step ${stepId}`);
      }
    }
    if (step.status !== "unsigned") {
      throw policyViolation(`step ${stepId} is already ${step.status}`);
    }

    submitStepState(state, stepId, txHash);
    services.store.save(state);
    services.hub.publish({
      type: "step.submitted",
      data: { planId: id, stepId, txHash, explorerUrl: step.explorerUrl! },
      ts: new Date().toISOString(),
    });

    // Background finality: receipts are polled, never trusted synchronously.
    void watchStep({ net: services.net, store: services.store, hub: services.hub }, id, stepId);

    return c.json(
      { ok: true, planId: id, stepId, status: step.status, txHash, explorerUrl: step.explorerUrl },
      200,
    );
  });

  app.openapi(listPlansRoute as any, async (c: any) => {
    const services = c.get("services") as AppServices;
    services.keys.authenticate(c.req.header("X-API-Key"));
    const plans = services.store.list(50).map(toRecentPlan);
    return c.json(plans, 200);
  });

  app.openapi(listKeysRoute as any, async (c: any) => {
    const services = assertOperator(c);
    return c.json(services.keys.listKeys().map(keyViewToWire), 200);
  });

  app.openapi(createKeyRoute as any, async (c: any) => {
    const services = assertOperator(c);
    const policy = c.req.valid("json");
    const created = services.keys.createKey(policy);
    return c.json(
      { apiKeyId: created.id, apiKey: created.raw, policy: policyToWire(created.view.policy) },
      201,
    );
  });

  app.openapi(revokeKeyRoute as any, async (c: any) => {
    const services = assertOperator(c);
    const { id } = c.req.valid("param") as { id: string };
    if (!services.keys.revokeKey(id)) throw notFound("Key not found.");
    return c.newResponse(null, 204);
  });
}

function assertOperator(c: any): AppServices {
  const services = c.get("services") as AppServices;
  const presented = sha256Hex(c.req.header("X-API-Key") ?? "");
  if (!services.operatorKeyHash || presented !== services.operatorKeyHash) throw forbidden();
  return services;
}

/** Serialize a policy for the wire: bigint amounts become decimal strings. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function policyToWire(p: ApiKeyPolicy): any {
  return { ...p, maxTotalPerRequest: p.maxTotalPerRequest.toString() };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function keyViewToWire(v: ApiKeyView): any {
  return { ...v, policy: policyToWire(v.policy) };
}

function toRecentPlan(p: PlanState): {
  planId: string;
  chain: string;
  sourceToken: string;
  createdAt: string;
  status: string;
  sourceTokenSpent: string;
  memo: string | null;
} {
  return {
    planId: p.planId,
    chain: p.chain,
    sourceToken: p.sourceToken,
    createdAt: p.createdAt,
    status: p.status,
    sourceTokenSpent: p.totals.sourceTokenSpent.toString(),
    memo: p.memo,
  };
}

/* ----------------------------- helpers ----------------------------- */

export function enforcePolicy(
  services: AppServices,
  policy: ApiKeyPolicy,
  body: PayoutRequestParsed,
  sourceTokenSpent: bigint,
): void {
  const tokens = [body.sourceToken as never, ...body.payments.map((p) => p.currency as never)];
  services.keys.assertTokensAllowed(policy, tokens);
  services.keys.assertUnderCap(policy, sourceTokenSpent);
}

async function checkFunding(
  services: AppServices,
  body: PayoutRequestParsed,
  sourceTokenSpent: bigint,
  estimatedGasUsdcNative: bigint,
): Promise<void> {
  const { net } = services;
  const native = await net.getNativeBalance(body.chain as never, body.payer);
  const neededNative = estimatedGasUsdcNative * 2n;
  if (native < neededNative) {
    throw payerInsufficientFunds("payer does not have enough native USDC for gas", {
      nativeBalance: native.toString(),
      needed: neededNative.toString(),
    });
  }
  const tokenBalance = await net.getTokenBalance(body.chain as never, body.sourceToken as never, body.payer);
  if (tokenBalance < sourceTokenSpent) {
    throw payerInsufficientFunds(`payer does not have enough ${body.sourceToken}`, {
      tokenBalance: tokenBalance.toString(),
      needed: sourceTokenSpent.toString(),
    });
  }
}