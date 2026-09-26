/** Wire types mirroring the Payrail API (see api/src/http/schemas). */
export type ChainName = "mainnet" | "testnet" | "basesepolia";
export type TokenName = "USDC" | "EURC" | "cirBTC" | "WETH";

export interface QuoteRequest {
  chain: ChainName;
  tokenIn: TokenName;
  tokenOut: TokenName;
  amount: string;
  slippageBps?: number;
}

export interface QuoteFee {
  type: "provider" | "gas" | "network" | "protocol";
  token: TokenName;
  amount: string;
}

export interface Quote {
  source: string;
  chain: ChainName;
  tokenIn: TokenName;
  tokenOut: TokenName;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  estimatedFeeUsdc: string;
  feeInOutput: string;
  priceImpactBps: number;
  expiry: number;
  fees: QuoteFee[];
  raw: unknown;
}

export interface SourceFailure {
  source: string;
  error: string;
}

export interface QuoteResponse {
  chain: ChainName;
  tokenIn: TokenName;
  tokenOut: TokenName;
  amountIn: string;
  best: Quote;
  alternatives: Quote[];
  failed: SourceFailure[];
  quoteExpiresAt: number;
  requestId: string;
}

export interface Payment {
  recipient: `0x${string}`;
  amount: string;
  currency: TokenName;
}

export interface PayoutRequest {
  chain: ChainName;
  payer: `0x${string}`;
  sourceToken: TokenName;
  memo?: string;
  payments: Payment[];
}

export interface PlanTx {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Native USDC (18-dec) base units; "0" for ERC-20 swaps/batch payouts. */
  value: string;
}

export interface PayoutLeg {
  recipient: `0x${string}`;
  amount: string;
}

export type PlanStep =
  | {
      type: "approve";
      token: TokenName;
      spender: `0x${string}`;
      /** "0" encodes max uint256 approval. */
      amount: string;
      tx: PlanTx;
      description: string;
    }
  | {
      type: "swap";
      tokenIn: TokenName;
      tokenOut: TokenName;
      amountIn: string;
      amountOut: string;
      minAmountOut: string;
      source: string;
      tx: PlanTx;
      description: string;
    }
  | {
      type: "batchPayout";
      currency: TokenName;
      payouts: PayoutLeg[];
      tx: PlanTx;
      description: string;
    };

export interface PlanTotals {
  sourceToken: TokenName;
  sourceTokenSpent: string;
  payouts: Partial<Record<TokenName, string>>;
  feesUsdc: string;
  estimatedGasUsdc: string;
  /** Gas currency for `estimatedGasUsdc` (USDC native on Arc, ETH on Base). */
  gasToken?: { symbol: string; decimals: number };
}

export interface Plan {
  planId: string;
  createdAt: string;
  chain: ChainName;
  payer: `0x${string}`;
  sourceToken: TokenName;
  memo: string | null;
  steps: PlanStep[];
  totals: PlanTotals;
  quoteExpiresAt: string;
  warnings: string[];
}

export interface PayoutResponse {
  plan: Plan;
  requestId: string;
}

export type StepStatus = "unsigned" | "submitted" | "confirmed" | "failed";
export type PlanLifecycle = "created" | "inProgress" | "final" | "failed";

export interface StepState {
  stepId: number;
  status: StepStatus;
  txHash: `0x${string}` | null;
  explorerUrl: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  failedError: string | null;
}

export type PlanStepState = PlanStep & StepState;

export interface PlanSummary {
  confirmedSteps: number[];
  failedSteps: number[];
  txHashes: `0x${string}`[];
}

export interface PlanState {
  planId: string;
  status: PlanLifecycle;
  chain: ChainName;
  payer: `0x${string}`;
  sourceToken: TokenName;
  memo: string | null;
  steps: PlanStepState[];
  totals: PlanTotals;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  quoteExpiresAt: string;
  final: PlanSummary | null;
}

export interface SubmitStep {
  stepId: number;
  txHash: `0x${string}`;
}

export interface SubmitStepResponse {
  ok: true;
  planId: string;
  stepId: number;
  status: StepStatus;
  txHash: `0x${string}`;
  explorerUrl: string;
}

export type SseEvent =
  | { type: "plan.created"; data: PlanState; ts: string }
  | {
      type: "step.submitted";
      data: { planId: string; stepId: number; txHash: `0x${string}`; explorerUrl: string };
      ts: string;
    }
  | {
      type: "step.confirmed";
      data: {
        planId: string;
        stepId: number;
        txHash: `0x${string}`;
        explorerUrl: string;
        gasUsedUsdc?: string;
      };
      ts: string;
    }
  | {
      type: "step.failed";
      data: { planId: string; stepId: number; txHash: `0x${string}` | null; error: string };
      ts: string;
    }
  | {
      type: "plan.final";
      data: {
        planId: string;
        status: "final" | "failed";
        confirmedSteps: number[];
        failedSteps: number[];
        txHashes: `0x${string}`[];
      };
      ts: string;
    };

export interface ApiKeyPolicy {
  name: string;
  /** USDC base units (6 decimals): cap on total USD value of one request. */
  maxTotalPerRequest: string;
  allowedTokens: TokenName[];
  maxSlippageBps: number;
  requestsPerMinute: number;
}

export interface ApiKeyView {
  id: string;
  name: string;
  policy: ApiKeyPolicy;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreateKeyResponse {
  apiKeyId: string;
  apiKey: string;
  policy: ApiKeyPolicy;
}

export interface PayoutEstimate {
  chain: ChainName;
  sourceToken: TokenName;
  perCurrencyTotals: Partial<Record<TokenName, string>>;
  /** Total source-token base units required (inputs + swap via quoted rates). */
  sourceNeeded: Partial<Record<TokenName, string>>;
  estimatedGasUsdc: string;
  feesUsdc: string;
  gasToken?: { symbol: string; decimals: number };
  stepsPreview: { type: PlanStep["type"]; description: string }[];
  warnings: string[];
}

export interface Health {
  ok: true;
  chain: ChainName;
  version: string;
  uptimeSec: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path?: (string | number)[]; message: string }[] };
  requestId: string;
}

export interface RecentPlan {
  planId: string;
  chain: ChainName;
  sourceToken: TokenName;
  createdAt: string;
  status: PlanLifecycle;
  sourceTokenSpent: string;
  memo: string | null;
}