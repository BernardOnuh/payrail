import { PayrailError, toPayrailError } from "../errors";
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
import type { PayrailProvider, StreamSink } from "./provider";

/** Checksummed placeholder payer for estimates made before a wallet connects;
 * it only shapes the math (swap recipient), never signs or receives funds. */
const ESTIMATE_FALLBACK_PAYER = "0x959139C138Fa2925B86b1d5Db4785E8C35914439";

/**
 * Real-mode provider: proxies to the Payrail HTTP API using the server-side
 * key (the operator key in practice — it is also the only key that can manage
 * other keys via /v1/keys).
 */
export class HttpProvider implements PayrailProvider {
  readonly mode = "api" as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    const baseUrl = process.env.PAYRAIL_API_URL;
    const apiKey = process.env.PAYRAIL_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new PayrailError(
        "PAYRAIL_MODE=api requires PAYRAIL_API_URL and PAYRAIL_API_KEY (server-side env).",
        { status: 500, code: "INTERNAL_ERROR" },
      );
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          ...(init?.headers ?? {}),
        },
      });
    } catch (e) {
      throw new PayrailError(`Payrail API unreachable: ${(e as Error).message}`, {
        status: 502,
        code: "INTERNAL_ERROR",
      });
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw toPayrailError(body as never);
    }
    return body as T;
  }

  async health(): Promise<Health> {
    return this.request("/health");
  }

  async quote(req: QuoteRequest): Promise<QuoteResponse> {
    return this.request("/v1/quote", { method: "POST", body: JSON.stringify(req) });
  }

  async estimatePayout(req: Parameters<PayrailProvider["estimatePayout"]>[0]): Promise<PayoutEstimate> {
    return this.request<PayoutEstimate>("/v1/estimate", {
      method: "POST",
      body: JSON.stringify({ ...req, payer: req.payer ?? ESTIMATE_FALLBACK_PAYER }),
    });
  }

  async createPayout(req: PayoutRequest): Promise<PayoutResponse> {
    return this.request("/v1/payout", { method: "POST", body: JSON.stringify(req) });
  }

  async getPlan(id: string): Promise<PlanState> {
    return this.request(`/v1/plan/${encodeURIComponent(id)}`);
  }

  async submitStep(id: string, body: SubmitStep): Promise<SubmitStepResponse> {
    return this.request(`/v1/plan/${encodeURIComponent(id)}/submitted`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async listPlans(): Promise<RecentPlan[]> {
    return this.request<RecentPlan[]>("/v1/plans");
  }

  async listKeys(): Promise<ApiKeyView[]> {
    return this.request<ApiKeyView[]>("/v1/keys");
  }

  async createKey(policy: ApiKeyPolicy): Promise<CreateKeyResponse> {
    return this.request<CreateKeyResponse>("/v1/keys", {
      method: "POST",
      body: JSON.stringify(policy),
    });
  }

  async revokeKey(id: string): Promise<void> {
    await this.request<null>(`/v1/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async stream(id: string, signal: AbortSignal, sink: StreamSink): Promise<void> {
    // 404 / auth failures surface before we switch to streaming mode.
    const res = await fetch(`${this.baseUrl}/v1/stream/${encodeURIComponent(id)}`, {
      headers: { "x-api-key": this.apiKey },
      signal,
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as never;
      throw toPayrailError(body);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Forward raw bytes unchanged — the client-side EventSource parses the
        // upstream `data:`/`:` lines exactly as Payrail emits them.
        sink.raw(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }
  }
}