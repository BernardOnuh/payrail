/**
 * Quote broker: runs every source that supports the pair in parallel with a
 * per-source timeout, and picks the best (largest amountOut - feeInOutput).
 */

import type { LiquiditySource, Quote, QuoteRequest, QuoteResult } from "./types.js";

export interface QuoteEngineOptions {
  timeoutMs?: number;
}

type Outcome =
  | { ok: true; quote: Quote }
  | { ok: false; sourceName: string; error: string };

export class QuoteEngine {
  readonly sources: LiquiditySource[];
  readonly timeoutMs: number;

  constructor(sources: LiquiditySource[], opts: QuoteEngineOptions = {}) {
    this.sources = sources;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  async getQuote(req: QuoteRequest): Promise<QuoteResult> {
    const candidates = this.sources.filter((s) => s.supports(req.chain, req.tokenIn, req.tokenOut));
    if (candidates.length === 0) {
      throw new Error(`no liquidity source supports ${req.tokenIn}->${req.tokenOut} on ${req.chain}`);
    }

    const outcomes = await Promise.all(
      candidates.map(async (source): Promise<Outcome> => {
        try {
          const quote = await withTimeout(source.getQuote(req), this.timeoutMs);
          return { ok: true, quote };
        } catch (e) {
          return { ok: false, sourceName: source.name, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    const ok = outcomes.filter((o): o is { ok: true; quote: Quote } => o.ok);
    const failed = outcomes
      .filter((o): o is { ok: false; sourceName: string; error: string } => !o.ok)
      .map((o) => ({ source: o.sourceName, error: o.error }));

    if (ok.length === 0) {
      const detail = failed.map((f) => `${f.source}: ${f.error}`).join("; ");
      throw new Error(`no ${req.tokenIn}->${req.tokenOut} quote on ${req.chain}: ${detail}`);
    }

    const best = ok
      .slice(1)
      .reduce(
        (acc, o) => (o.quote.amountOut - o.quote.feeInOutput > acc.quote.amountOut - acc.quote.feeInOutput ? o : acc),
        ok[0]!,
      ).quote;

    return {
      best,
      alternatives: ok.filter((o) => o.quote !== best).map((o) => o.quote),
      failed,
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`source timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}