import type {
  ApiKeyView,
  CreateKeyResponse,
  Health,
  PayoutEstimate,
  PayoutRequest,
  PayoutResponse,
  PlanState,
  QuoteRequest,
  QuoteResponse,
  RecentPlan,
  SseEvent,
  SubmitStep,
  SubmitStepResponse,
} from "../types";
import type { ApiKeyPolicy } from "../types";

/** Events emitted to an SSE stream. */
export type StreamSink = {
  /** Write one event as `data: <json>\n\n`. */
  emit(event: SseEvent): void;
  /** Forward raw SSE bytes/lines (keepalive comments, upstream passthrough). */
  raw(text: string): void;
};

/**
 * Single data-layer abstraction over the Payrail API. `mock` runs entirely
 * inside the Next server (no Payrail API needed); `api` proxies to the real
 * HTTP service with the server-side key. Either way no secret ever reaches a
 * client bundle.
 */
export interface PayrailProvider {
  readonly mode: "mock" | "api";
  health(): Promise<Health>;
  quote(req: QuoteRequest): Promise<QuoteResponse>;
  estimatePayout(req: {
    chain: "mainnet" | "testnet" | "basesepolia";
    sourceToken: "USDC" | "EURC" | "cirBTC" | "WETH";
    payer?: string;
    payments: { recipient: `0x${string}`; amount: string; currency: "USDC" | "EURC" | "cirBTC" | "WETH" }[];
  }): Promise<PayoutEstimate>;
  createPayout(req: PayoutRequest): Promise<PayoutResponse>;
  getPlan(id: string): Promise<PlanState>;
  submitStep(id: string, body: SubmitStep): Promise<SubmitStepResponse>;
  listPlans(): Promise<RecentPlan[]>;
  listKeys(): Promise<ApiKeyView[]>;
  createKey(policy: ApiKeyPolicy): Promise<CreateKeyResponse>;
  revokeKey(id: string): Promise<void>;
  /** Stream events for a plan. Resolves when the plan is final or the stream closes. */
  stream(id: string, signal: AbortSignal, sink: StreamSink): Promise<void>;
}