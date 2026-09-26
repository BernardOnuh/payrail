import { getChain } from "@payrail/api/liquidity";
import type { ChainName, TokenName } from "./config.js";

export interface TokenMeta {
  key: TokenName;
  address: `0x${string}`;
  decimals: number;
  verified: boolean;
}

/**
 * Minimal human-readable amount: `amountBase` / 10^decimals, trimmed to a
 * reasonable precision so results stay concise (no giant dumps).
 */
export function humanAmount(amountBase: bigint | string, decimals: number): string {
  const base = typeof amountBase === "string" ? BigInt(amountBase) : amountBase;
  const abs = base < 0n ? -base : base;
  const whole = abs / 10n ** BigInt(decimals);
  const frac = abs % 10n ** BigInt(decimals);
  if (frac === 0n || decimals === 0) return whole.toString();
  const pad = frac.toString().padStart(decimals, "0");
  const trimmed = pad.replace(/0+$/, "");
  const fracPart = trimmed.length > 6 ? trimmed.slice(0, 6) : trimmed;
  return `${whole}.${fracPart}`;
}

/** Base-units helper text for a token, e.g. USDC 1 token = "1000000". */
export function unitNote(token: TokenName, decimals: number): string {
  return `${token} has ${decimals} decimals; 1 ${token} = "1"${"0".repeat(decimals)} base units.`;
}

/** Token metadata for a chain from the shared registry (the single source of truth). */
export function tokensForChain(chain: ChainName): TokenMeta[] {
  const config = getChain(chain);
  return (Object.values(config.tokens) as TokenMeta[]).map((t) => ({
    key: t.key,
    address: t.address,
    decimals: t.decimals,
    verified: t.verified,
  }));
}

export function decimalsFor(chain: ChainName, token: TokenName): number {
  const t = getChain(chain).tokens[token];
  if (!t) throw new Error(`token ${token} is not supported on chain ${chain}`);
  return t.decimals;
}

export interface QuoteSummaryShape {
  source: string;
  tokenIn: TokenName;
  tokenOut: TokenName;
  amountIn: string;
  amountInBaseUnits: bigint | string;
  amountOut: string;
  minAmountOut: string;
  estimatedFeeUsdc: string;
  priceImpactBps: number;
  expiresAtUnixSeconds: number;
}

interface QuoteSummaryInput {
  source: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  estimatedFeeUsdc: string;
  priceImpactBps: number;
  expiry: number;
  tokenIn: string;
  tokenOut: string;
}

export function quoteSummary(q: QuoteSummaryInput, decimalIn: number, decimalOut: number): QuoteSummaryShape {
  return {
    source: q.source,
    tokenIn: q.tokenIn as TokenName,
    tokenOut: q.tokenOut as TokenName,
    amountIn: humanAmount(q.amountIn, decimalIn),
    amountInBaseUnits: q.amountIn,
    amountOut: humanAmount(q.amountOut, decimalOut),
    minAmountOut: humanAmount(q.minAmountOut, decimalOut),
    estimatedFeeUsdc: humanAmount(q.estimatedFeeUsdc, 18),
    priceImpactBps: q.priceImpactBps,
    expiresAtUnixSeconds: q.expiry,
  };
}