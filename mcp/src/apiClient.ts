/** Structured error thrown by the API client; mirrors the Payrail API error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(message: string, opts: { status: number; code: string; details?: unknown; requestId?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}

export interface QuoteWire {
  source: string;
  chain: "mainnet" | "testnet" | "basesepolia";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  estimatedFeeUsdc: string;
  feeInOutput: string;
  priceImpactBps: number;
  expiry: number;
}

export interface QuoteResponseWire {
  chain: "mainnet" | "testnet" | "basesepolia";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  best: QuoteWire;
  alternatives: QuoteWire[];
  failed: { source: string; error: string }[];
  quoteExpiresAt: number;
}

export interface PlanStepWire {
  type: "approve" | "swap" | "batchPayout";
  description: string;
  tx: { to: `0x${string}`; data: `0x${string}`; value: string };
  [k: string]: unknown;
}

export interface PlanWire {
  planId: string;
  chain: "mainnet" | "testnet" | "basesepolia";
  payer: `0x${string}`;
  sourceToken: string;
  memo: string | null;
  steps: PlanStepWire[];
  totals: {
    sourceToken: string;
    sourceTokenSpent: string;
    payouts: Record<string, string>;
    feesUsdc: string;
    estimatedGasUsdc: string;
    gasToken?: { symbol: string; decimals: number };
  };
  quoteExpiresAt: string;
  warnings: string[];
}

export interface PlanStateStepWire extends PlanStepWire {
  stepId: number;
  status: "unsigned" | "submitted" | "confirmed" | "failed";
  txHash: `0x${string}` | null;
  explorerUrl: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  failedError: string | null;
}

export interface PlanStateWire {
  planId: string;
  status: "created" | "inProgress" | "final" | "failed";
  chain: "mainnet" | "testnet" | "basesepolia";
  payer: `0x${string}`;
  sourceToken: string;
  memo: string | null;
  steps: PlanStateStepWire[];
  totals: PlanWire["totals"];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  quoteExpiresAt: string;
  final: {
    confirmedSteps: number[];
    failedSteps: number[];
    txHashes: `0x${string}`[];
  } | null;
}

export interface QuoteRequestBody {
  chain: "mainnet" | "testnet" | "basesepolia";
  tokenIn: string;
  tokenOut: string;
  amount: string;
  slippageBps?: number;
}

export interface PaymentInput {
  recipient: `0x${string}`;
  amount: string;
  currency: string;
}

export interface PayoutRequestBody {
  chain: "mainnet" | "testnet" | "basesepolia";
  payer: `0x${string}`;
  sourceToken: string;
  memo?: string;
  payments: PaymentInput[];
}

/**
 * Thin HTTP client for the Payrail API. The MCP server never holds keys: every
 * write call the API performs is plan-only (unsigned) or a plan state read.
 */
export class PayrailApiClient {
  readonly baseUrl: string;
  readonly chain: "mainnet" | "testnet" | "basesepolia";
  readonly apiKey: string | undefined;
  readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; chain: "mainnet" | "testnet" | "basesepolia"; apiKey?: string; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.chain = opts.chain;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  get configured(): boolean {
    return (this.apiKey?.length ?? 0) > 0;
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new ApiError(
        "Payrail API key is not configured. Set PAYRAIL_API_KEY (see mcp/README.md).",
        { status: 401, code: "UNAUTHORIZED" },
      );
    }
    return this.apiKey;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(this.requireKey() ? { "x-api-key": this.apiKey } : {}),
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      if (res.status === 204) return undefined as T;
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const err = (body as { error?: { code?: string; message?: string; details?: unknown }; requestId?: string });
        throw new ApiError(err?.error?.message ?? `HTTP ${res.status}`, {
          status: res.status,
          code: err?.error?.code ?? "INTERNAL_ERROR",
          details: err?.error?.details,
          requestId: err?.requestId,
        });
      }
      return body as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new ApiError(`Payrail API timed out after ${this.timeoutMs}ms`, {
          status: 504,
          code: "INTERNAL_ERROR",
        });
      }
      throw new ApiError(`Payrail API unreachable: ${(e as Error).message}`, {
        status: 502,
        code: "INTERNAL_ERROR",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  getQuote(body: QuoteRequestBody): Promise<QuoteResponseWire> {
    return this.request("/v1/quote", { method: "POST", body: JSON.stringify(body) });
  }

  createPayoutPlan(body: PayoutRequestBody): Promise<{ plan: PlanWire; requestId: string }> {
    return this.request("/v1/payout", { method: "POST", body: JSON.stringify(body) });
  }

  getPlan(planId: string): Promise<PlanStateWire> {
    return this.request(`/v1/plan/${encodeURIComponent(planId)}`, { method: "GET" });
  }
}