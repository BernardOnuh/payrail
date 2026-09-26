import type { ChainName, TokenName } from "./schemas/common.js";

/** On-chain execution state for a single step of a plan. */
export type StepStatus = "unsigned" | "submitted" | "confirmed" | "failed";
export type PlanLifecycle = "created" | "inProgress" | "final" | "failed";

export interface DomainTx {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Native USDC (18-decimal) base units; 0 for ERC-20 swaps/batch payouts. */
  value: bigint;
}

export type DomainStep =
  | {
      type: "approve";
      token: TokenName;
      spender: `0x${string}`;
      /** 0n encodes "max uint256 approval". */
      amount: bigint;
      tx: DomainTx;
      description: string;
    }
  | {
      type: "swap";
      tokenIn: TokenName;
      tokenOut: TokenName;
      amountIn: bigint;
      amountOut: bigint;
      minAmountOut: bigint;
      source: string;
      tx: DomainTx;
      description: string;
    }
  | {
      type: "batchPayout";
      currency: TokenName;
      payouts: { recipient: `0x${string}`; amount: bigint }[];
      tx: DomainTx;
      description: string;
    };

export interface PlanTotals {
  sourceToken: TokenName;
  /** Total source token (base units) debited from the payer. */
  sourceTokenSpent: bigint;
  /** Sum actually paid out to recipients, per currency (base units). */
  payouts: Partial<Record<TokenName, bigint>>;
  /** Total non-gas fees, native USDC (18-dec). */
  feesUsdc: bigint;
  /** Estimated gas, native USDC (18-dec). */
  estimatedGasUsdc: bigint;
}

/** A plan step persisted with its execution state (amounts are bigint). */
export type PlanStepState = DomainStep & {
  stepId: number;
  status: StepStatus;
  txHash: `0x${string}` | null;
  explorerUrl: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  failedError: string | null;
};

/** Immutable plan data as quoted/created. Bigints stay native. */
export interface Plan {
  planId: string;
  createdAt: string;
  chain: ChainName;
  payer: `0x${string}`;
  sourceToken: TokenName;
  memo: string | null;
  steps: DomainStep[];
  totals: PlanTotals;
  quoteExpiresAt: string;
  warnings: string[];
}

export interface PlanSummary {
  confirmedSteps: number[];
  failedSteps: number[];
  txHashes: `0x${string}`[];
}

/** Mutable execution state of a plan (what /v1/plan/:id returns). */
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