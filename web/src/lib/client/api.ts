import type {
  ApiKeyPolicy,
  ApiKeyView,
  CreateKeyResponse,
  PayoutEstimate,
  PayoutResponse,
  Plan,
  PlanState,
  QuoteRequest,
  QuoteResponse,
  RecentPlan,
  SubmitStepResponse,
} from "@/lib/payrail/types";

export type PayoutInput = {
  chain: "mainnet" | "testnet" | "basesepolia";
  payer: string;
  sourceToken: string;
  memo?: string;
  payments: { recipient: string; amount: string; currency: string }[];
};

export type EstimateInput = {
  chain: "mainnet" | "testnet" | "basesepolia";
  sourceToken: string;
  payer?: string;
  payments: { recipient: string; amount: string; currency: string }[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; requestId?: string } })?.error;
    throw new ApiError(res.status, err?.code ?? "INTERNAL_ERROR", err?.message ?? `Request failed (${res.status})`, err?.requestId);
  }
  return body as T;
}

export const api = {
  streamUrl: (planId: string) => `/api/stream/${planId}`,
  health: () => http<{ ok: boolean; mode: string }>("/api/health"),
  quote: (q: QuoteRequest) => http<QuoteResponse>("/api/quote", { method: "POST", body: JSON.stringify(q) }),
  estimate: (body: EstimateInput) => http<PayoutEstimate>("/api/estimate", { method: "POST", body: JSON.stringify(body) }),
  createPayout: (body: PayoutInput) => http<PayoutResponse>("/api/payout", { method: "POST", body: JSON.stringify(body) }),
  getPlan: (id: string) => http<PlanState>("/api/plan/" + encodeURIComponent(id)),
  submitStep: (id: string, body: { stepId: number; txHash: string }) =>
    http<SubmitStepResponse>("/api/plan/" + encodeURIComponent(id) + "/submitted", { method: "POST", body: JSON.stringify(body) }),
  plans: () => http<RecentPlan[]>("/api/plans"),
  keys: () => http<ApiKeyView[]>("/api/keys"),
  createKey: (policy: ApiKeyPolicy) => http<CreateKeyResponse>("/api/keys", { method: "POST", body: JSON.stringify(policy) }),
  revokeKey: (id: string) => http<void>(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
};