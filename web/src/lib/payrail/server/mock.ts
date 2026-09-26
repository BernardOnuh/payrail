import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PayrailError } from "../errors";
import type {
  ApiKeyPolicy,
  ApiKeyView,
  CreateKeyResponse,
  Health,
  PayoutEstimate,
  PayoutRequest,
  PayoutResponse,
  Payment,
  PayoutLeg,
  Plan,
  PlanState,
  PlanStep,
  PlanTotals,
  Quote,
  QuoteRequest,
  QuoteResponse,
  RecentPlan,
  SseEvent,
  StepState,
  SubmitStep,
  SubmitStepResponse,
} from "../types";
import { getAddress } from "viem";
import type { PayrailProvider, StreamSink } from "./provider";
import type { ChainName, TokenName } from "../types";

/* ---------------------------------------------------------------------------
 * Mock provider — deterministic fake price/plan/keys/store so every screen is
 * fully usable without a running Payrail API. Nothing here is real market data;
 * quotes are labelled as such in the UI.
 * ------------------------------------------------------------------------- */

const USDC_PRICE_DEC = 1_000_000n; // 1 USDC
const PRICE_MICRO_USDC_PER_TOKEN: Record<TokenName, bigint> = {
  USDC: 1_000_000n,
  EURC: 1_080_000n, // 1 EURC ≈ 1.08 USDC
  cirBTC: 65_000n * 1_000_000n, // 1 cirBTC ≈ 65 000 USDC
  WETH: 2_500n * 1_000_000n, // 1 WETH ≈ 2 500 USDC
};

const DECIMALS: Record<TokenName, number> = { USDC: 6, EURC: 6, cirBTC: 8, WETH: 18 };
const EXCHANGE_CONTRACT = getAddress("0x8702463e73f74d0b6765aBceb314Ef07aCb92650"); // universal router (mainnet, mock)
const BATCH_CONTRACT = getAddress("0xA1B76A6076e2e04B2E53300aF0e5f6B4bB123456"); // mock batch splitter

const quoteTtlSeconds = Number(process.env.PAYRAIL_MOCK_QUOTE_TTL_SECONDS ?? 120) || 120;
const confirmMs = Number(process.env.PAYRAIL_MOCK_CONFIRM_MS ?? 1400) || 1400;

interface StoredPlan {
  plan: PlanState;
  createdAt: number;
}
interface StoredKey {
  id: string;
  name: string;
  raw: string;
  hashed: string;
  policy: ApiKeyPolicy;
  createdAt: string;
  revokedAt: string | null;
}
interface Store {
  plans: StoredPlan[];
  keys: StoredKey[];
}

const rand = () => randomBytes(12).toString("base64url");
const nowIso = () => new Date().toISOString();

function storePath(): string {
  return process.env.PAYRAIL_MOCK_FILE ?? join(process.cwd(), ".data", "store.json");
}

const emptyStore = (): Store => ({ plans: [], keys: [] });

let cache: Store | null = null;
function loadStore(): Store {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(storePath(), "utf8")) as Store;
    cache = { plans: parsed.plans ?? [], keys: parsed.keys ?? [] };
  } catch {
    cache = emptyStore();
  }
  return cache;
}
function saveStore(): void {
  const store = cache ?? emptyStore();
  const dir = dirname(storePath());
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf8");
  } catch {
    // non-fatal: falls back to in-memory
  }
}

const floorDiv = (a: bigint, b: bigint) => (a < 0n ? -((-a) / b) : a / b);

/** amountOut in `out` base units when selling `inBase` of `in` at mock prices. */
function rateAmount(inBase: bigint, inToken: TokenName, outToken: TokenName): bigint {
  const num = inBase * PRICE_MICRO_USDC_PER_TOKEN[inToken] * 10n ** BigInt(DECIMALS[outToken]);
  const den = PRICE_MICRO_USDC_PER_TOKEN[outToken] * 10n ** BigInt(DECIMALS[inToken]);
  return floorDiv(num, den);
}

function usdcMicroToNative(amount: string | bigint): string {
  return (toBigInt(amount) * 10n ** 12n).toString();
}
const toBigInt = (s: string | bigint): bigint => {
  try {
    return typeof s === "bigint" ? s : BigInt(s);
  } catch {
    return 0n;
  }
};

function mockQuote(req: QuoteRequest): QuoteResponse {
  const { tokenIn, tokenOut } = req;
  if (tokenIn === tokenOut) {
    throw new PayrailError("tokenIn and tokenOut must differ", { status: 400, code: "VALIDATION_ERROR" });
  }
  const inBase = BigInt(req.amount);
  const outBase = rateAmount(inBase, tokenIn, tokenOut);
  const slippageBps = req.slippageBps ?? 50;

  const amountUsdMicro = floorDiv(inBase * PRICE_MICRO_USDC_PER_TOKEN[tokenIn], 10n ** BigInt(DECIMALS[tokenIn]));
  const impact = Math.min(40, 6 + Number(amountUsdMicro) / 4_000_000);

  const feeNative = BigInt(400_000_000_000_000n + BigInt(Math.floor(impact)) * 25_000_000_000_000n);
  const feeOut = rateAmount(feeNative / 10n ** 12n, "USDC", tokenOut);
  const minAmountOut = floorDiv(outBase * (10_000n - BigInt(slippageBps)), 10_000n);
  const expiry = Math.floor(Date.now() / 1000) + quoteTtlSeconds;

  const bestFirst = ((tokenIn.charCodeAt(0) + tokenOut.charCodeAt(0)) % 2 === 0) ? "uniswap-v4" : "app-kit";
  const alt = bestFirst === "uniswap-v4" ? "app-kit" : "uniswap-v4";

  const base: Omit<Quote, "source" | "amountOut" | "minAmountOut" | "fees" | "raw"> = {
    chain: req.chain,
    tokenIn,
    tokenOut,
    amountIn: inBase.toString(),
    estimatedFeeUsdc: feeNative.toString(),
    feeInOutput: feeOut.toString(),
    priceImpactBps: impact,
    expiry,
  };

  const mk = (source: string, out: bigint, minOut: bigint, feeAdj: bigint): Quote => ({
    ...base,
    source,
    amountOut: out.toString(),
    minAmountOut: minOut.toString(),
    fees: [
      { type: "provider", token: tokenOut, amount: feeAdj.toString() },
      { type: "gas", token: "USDC", amount: usdcMicroToNative(250_000n) },
    ],
    raw: { pair: `${tokenIn}/${tokenOut}`, mock: true },
  });

  // The alternative route is ~2bps worse and slightly slower to settle.
  const altOut = floorDiv(outBase * 9998n, 10_000n);
  return {
    chain: req.chain,
    tokenIn,
    tokenOut,
    amountIn: inBase.toString(),
    best: mk(bestFirst, outBase, minAmountOut, 0n),
    alternatives: [mk(alt, altOut, floorDiv(altOut * (10_000n - BigInt(slippageBps)), 10_000n), feeOut / 2n)],
    failed: [],
    quoteExpiresAt: expiry,
    requestId: `req_${rand()}`,
  };
}

function buildPlan(req: PayoutRequest): { plan: Plan; steps: PlanStep[] } {
  const byCurrency = new Map<TokenName, Payment[]>();
  for (const p of req.payments) {
    const list = byCurrency.get(p.currency) ?? [];
    list.push(p);
    byCurrency.set(p.currency, list);
  }

  const steps: PlanStep[] = [];
  const gasSteps: { step: number; legs: number }[] = [];
  const sourceToken = req.sourceToken;
  const erc20 = (t: TokenName) => t !== "USDC";

  const approvals = new Set<string>();
  const approve = (token: TokenName, spender: string, label: string): void => {
    const key = `${token}:${spender}`;
    if (approvals.has(key)) return;
    approvals.add(key);
    steps.push({
      type: "approve",
      token,
      spender: getAddress(spender),
      amount: "0",
      tx: { to: getAddress(tokenForAddress(token)), data: "0x", value: "0" },
      description: `Approve ${token} for ${label}`,
    });
  };

  // Swap legs: any currency != source needs funding from the source.
  const swaps = new Map<TokenName, { amountOut: bigint; inBase: bigint; outBase: bigint }>();
  for (const [currency, list] of byCurrency) {
    if (currency === sourceToken) continue;
    const totalOut = list.reduce((a, p) => a + BigInt(p.amount), 0n);
    // Solve inBase s.t. rateAmount(s, source, currency) >= totalOut.
    const priceNum = PRICE_MICRO_USDC_PER_TOKEN[currency] * 10n ** BigInt(DECIMALS[sourceToken]);
    const priceDen = PRICE_MICRO_USDC_PER_TOKEN[sourceToken] * 10n ** BigInt(DECIMALS[currency]);
    const inBase = floorDiv(totalOut * priceNum, priceDen) + 1n;
    const outBase = rateAmount(inBase, sourceToken, currency);
    swaps.set(currency, { amountOut: totalOut, inBase, outBase });
    if (erc20(sourceToken)) approve(sourceToken, EXCHANGE_CONTRACT, "the swap router");
  }

  const feesUsdc = (BigInt(steps.length) + BigInt(req.payments.length)) * 90_000_000_000_000n;

  for (const [currency, { inBase, outBase }] of swaps) {
    const source = (currency === "EURC") ? "app-kit" : "uniswap-v4";
    const exp = Math.floor(Date.now() / 1000) + quoteTtlSeconds;
    steps.push({
      type: "swap",
      tokenIn: sourceToken,
      tokenOut: currency,
      amountIn: inBase.toString(),
      amountOut: outBase.toString(),
      minAmountOut: floorDiv(outBase * 9950n, 10_000n).toString(),
      source,
      tx: {
        to: getAddress(EXCHANGE_CONTRACT),
        data: `0x${"c304".repeat(4)}${"0000".repeat(2)}`,
        value: "0",
      },
      description: `Swap ${sourceToken} → ${currency} via ${source}`,
    });
  }

  // Batch payout legs.
  for (const [currency, list] of byCurrency) {
    const payouts: PayoutLeg[] = list.map((p) => ({ recipient: getAddress(p.recipient), amount: p.amount }));
    const total = list.reduce((a, p) => a + BigInt(p.amount), 0n);
    let payToken: string;
    if (currency === sourceToken) {
      payToken = sourceToken === "USDC" ? NATIVE_USDC() : tokenForAddress(currency);
      if (erc20(currency)) approve(currency, BATCH_CONTRACT, "the batch splitter");
    } else {
      const swap = swaps.get(currency);
      if (!swap) continue;
      payToken = erc20(currency) ? tokenForAddress(currency) : NATIVE_USDC();
      if (erc20(currency)) approve(currency, BATCH_CONTRACT, "the batch splitter");
      void swap;
    }
    steps.push({
      type: "batchPayout",
      currency,
      payouts,
      tx: {
        to: getAddress(BATCH_CONTRACT),
        data: "0x1000000000000000000000000",
        value: currency === "USDC" ? total.toString() : "0",
      },
      description: `Pay ${payouts.length}× ${currency} (${total} base units)`,
    });
    gasSteps.push({ step: steps.length, legs: payouts.length });
  }

  // Totals
  const payoutsTotals: Partial<Record<TokenName, string>> = {};
  for (const [currency, list] of byCurrency) {
    payoutsTotals[currency] = list.reduce((a, p) => a + BigInt(p.amount), 0n).toString();
  }
  let sourceSpent = 0n;
  for (const [currency, list] of byCurrency) {
    if (currency === sourceToken) {
      sourceSpent += list.reduce((a, p) => a + BigInt(p.amount), 0n);
    } else {
      const swap = swaps.get(currency);
      if (swap) sourceSpent += swap.inBase;
    }
  }

  const estimatedGas =
    BigInt(steps.length) * 2_000_000_000_000_000n +
    BigInt(req.payments.length) * 200_000_000_000_000n;

  const warnings: string[] = [];
  if (sourceToken === "USDC") {
    warnings.push("Native USDC needs no approval; the batch splitter settles legs with call value.");
  } else {
    warnings.push("ERC-20 source token: approval steps are included for the router and batch splitter.");
  }
  warnings.push("Mock provider: prices, fees and gas are simulated for the web demo.");

  const totals: PlanTotals = {
    sourceToken,
    sourceTokenSpent: sourceSpent.toString(),
    payouts: payoutsTotals,
    feesUsdc: feesUsdc.toString(),
    estimatedGasUsdc: estimatedGas.toString(),
  };

  const plan: Plan = {
    planId: `plr_${rand()}`,
    createdAt: nowIso(),
    chain: req.chain,
    payer: getAddress(req.payer),
    sourceToken,
    memo: req.memo ?? null,
    steps,
    totals,
    quoteExpiresAt: new Date(Date.now() + quoteTtlSeconds * 1000).toISOString(),
    warnings,
  };
  return { plan, steps };
}

function tokenForAddress(token: TokenName): string {
  switch (token) {
    case "EURC":
      return "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
    case "cirBTC":
      return "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0";
    case "WETH":
      return "0x128cC466B61f542da60c70e3aA11c10e19B84EDB";
    default:
      return NATIVE_USDC();
  }
}
const NATIVE_USDC = () => "0x3600000000000000000000000000000000000000";

function toPlanState(plan: Plan, stepsWithState?: StepState[]): PlanState {
  const now = nowIso();
  return {
    planId: plan.planId,
    status: "created",
    chain: plan.chain,
    payer: plan.payer,
    sourceToken: plan.sourceToken,
    memo: plan.memo,
    steps: plan.steps.map((s, i) => ({
      ...s,
      stepId: i,
      status: stepsWithState?.[i]?.status ?? "unsigned",
      txHash: stepsWithState?.[i]?.txHash ?? null,
      explorerUrl: stepsWithState?.[i]?.explorerUrl ?? null,
      submittedAt: stepsWithState?.[i]?.submittedAt ?? null,
      confirmedAt: stepsWithState?.[i]?.confirmedAt ?? null,
      failedError: stepsWithState?.[i]?.failedError ?? null,
    })) as PlanState["steps"],
    totals: plan.totals,
    warnings: plan.warnings,
    createdAt: plan.createdAt,
    updatedAt: now,
    quoteExpiresAt: plan.quoteExpiresAt,
    final: null,
  };
}

function recompute(state: PlanState): PlanState {
  const steps = state.steps;
  const confirmed = steps.filter((s) => s.status === "confirmed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  if (steps.length > 0 && confirmed + failed === steps.length) {
    return {
      ...state,
      status: failed > 0 ? "failed" : "final",
      final: {
        confirmedSteps: steps.filter((s) => s.status === "confirmed").map((s) => s.stepId),
        failedSteps: steps.filter((s) => s.status === "failed").map((s) => s.stepId),
        txHashes: steps.map((s) => s.txHash).filter((h): h is `0x${string}` => Boolean(h)),
      },
      updatedAt: nowIso(),
    };
  }
  if (confirmed > 0 && state.status === "created") {
    return { ...state, status: "inProgress", updatedAt: nowIso() };
  }
  return state;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export class MockProvider implements PayrailProvider {
  readonly mode = "mock" as const;

  async health(): Promise<Health> {
    return { ok: true, chain: "testnet", version: "web-mock", uptimeSec: 0 };
  }

  async quote(req: QuoteRequest): Promise<QuoteResponse> {
    return mockQuote(req);
  }

  async estimatePayout(req: Parameters<PayrailProvider["estimatePayout"]>[0]): Promise<PayoutEstimate> {
    const perCurrencyTotals: Partial<Record<TokenName, string>> = {};
    for (const p of req.payments) {
      perCurrencyTotals[p.currency] = (BigInt(perCurrencyTotals[p.currency] ?? "0") + BigInt(p.amount)).toString();
    }
    const sourceNeeded: Partial<Record<TokenName, string>> = {};
    for (const currency of Object.keys(perCurrencyTotals) as TokenName[]) {
      const total = BigInt(perCurrencyTotals[currency]!);
      if (currency === req.sourceToken) {
        sourceNeeded[currency] = total.toString();
      } else {
        const num = total * PRICE_MICRO_USDC_PER_TOKEN[currency] * 10n ** BigInt(DECIMALS[req.sourceToken]);
        const den = PRICE_MICRO_USDC_PER_TOKEN[req.sourceToken] * 10n ** BigInt(DECIMALS[currency]);
        sourceNeeded[req.sourceToken] = (BigInt(sourceNeeded[req.sourceToken] ?? "0") + floorDiv(num, den) + 1n).toString();
      }
    }
    const nSteps = new Set(Object.keys(perCurrencyTotals) as TokenName[]).size + (req.sourceToken !== "USDC" ? 1 : 0);
    const estimatedGas = BigInt(nSteps) * 2_000_000_000_000_000n + BigInt(req.payments.length) * 200_000_000_000_000n;
    return {
      chain: req.chain,
      sourceToken: req.sourceToken,
      perCurrencyTotals,
      sourceNeeded,
      estimatedGasUsdc: estimatedGas.toString(),
      feesUsdc: ((BigInt(nSteps) + BigInt(req.payments.length)) * 90_000_000_000_000n).toString(),
      stepsPreview: [
        ...(req.sourceToken !== "USDC" ? [{ type: "approve" as const, description: `Approve ${req.sourceToken} for the swap router` }] : []),
        ...(Object.keys(perCurrencyTotals) as TokenName[])
          .filter((c) => c !== req.sourceToken)
          .map((c) => ({ type: "swap" as const, description: `Swap ${req.sourceToken} → ${c}` })),
        ...(Object.keys(perCurrencyTotals) as TokenName[]).map((c) => ({
          type: "batchPayout" as const,
          description: `Pay out ${c}`,
        })),
      ],
      warnings: ["Mock estimate only."],
    };
  }

  async createPayout(req: PayoutRequest): Promise<PayoutResponse> {
    const { plan, steps } = buildPlan(req);
    const state = toPlanState(plan);
    const store = loadStore();
    store.plans.unshift({ plan: state, createdAt: Date.now() });
    store.plans = store.plans.slice(0, 100);
    saveStore();
    return { plan: { ...plan, steps }, requestId: `req_${rand()}` };
  }

  async getPlan(id: string): Promise<PlanState> {
    const store = loadStore();
    const found = store.plans.find((p) => p.plan.planId === id);
    if (!found) throw new PayrailError("Plan not found", { status: 404, code: "NOT_FOUND" });
    return recompute(found.plan);
  }

  async submitStep(id: string, body: SubmitStep): Promise<SubmitStepResponse> {
    const store = loadStore();
    const found = store.plans.find((p) => p.plan.planId === id);
    if (!found) throw new PayrailError("Plan not found", { status: 404, code: "NOT_FOUND" });
    const step = found.plan.steps.find((s) => s.stepId === body.stepId);
    if (!step) throw new PayrailError(`Step ${body.stepId} not found`, { status: 404, code: "STEP_NOT_FOUND" });
    if (step.status === "unsigned" || step.status === "failed") {
      step.status = "submitted";
      step.txHash = body.txHash;
      step.submittedAt = nowIso();
      step.explorerUrl = `https://explorer.${found.plan.chain}.arc.io/tx/${body.txHash}`;
      found.plan.updatedAt = nowIso();
      found.plan.status = found.plan.status === "created" ? "inProgress" : found.plan.status;
      saveStore();
    }
    return {
      ok: true,
      planId: id,
      stepId: body.stepId,
      status: step.status,
      txHash: body.txHash,
      explorerUrl: step.explorerUrl ?? "",
    };
  }

  async listPlans(): Promise<RecentPlan[]> {
    const store = loadStore();
    return store.plans.map(({ plan }) => ({
      planId: plan.planId,
      chain: plan.chain,
      sourceToken: plan.sourceToken,
      sourceTokenSpent: plan.totals.sourceTokenSpent,
      createdAt: plan.createdAt,
      memo: plan.memo,
      status: recompute(plan).status,
    }));
  }

  async listKeys(): Promise<ApiKeyView[]> {
    const store = loadStore();
    return store.keys.map((k) => ({
      id: k.id,
      name: k.name,
      policy: k.policy,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
    }));
  }

  async createKey(policy: ApiKeyPolicy): Promise<CreateKeyResponse> {
    const store = loadStore();
    const id = `k_${rand()}`;
    const raw = `payrail_${rand()}`;
    store.keys.unshift({
      id,
      name: policy.name,
      raw,
      hashed: hashKey(raw),
      policy,
      createdAt: nowIso(),
      revokedAt: null,
    });
    saveStore();
    return { apiKeyId: id, apiKey: raw, policy };
  }

  async revokeKey(id: string): Promise<void> {
    const store = loadStore();
    const key = store.keys.find((k) => k.id === id);
    if (!key) throw new PayrailError("Key not found", { status: 404, code: "NOT_FOUND" });
    key.revokedAt = nowIso();
    saveStore();
  }

  async stream(id: string, signal: AbortSignal, sink: StreamSink): Promise<void> {
    const store = loadStore();
    const found = store.plans.find((p) => p.plan.planId === id);
    if (!found) throw new PayrailError("Plan not found", { status: 404, code: "NOT_FOUND" });

    // Replay current state
    const state = recompute(found.plan);
    sink.emit({ type: "plan.created", data: state, ts: nowIso() });
    for (const step of state.steps) {
      if (step.status === "submitted") {
        sink.emit({ type: "step.submitted", data: { planId: id, stepId: step.stepId, txHash: step.txHash ?? "0x0".padEnd(66, "0") as `0x${string}`, explorerUrl: step.explorerUrl ?? "" }, ts: nowIso() });
      }
    }
    if (state.status === "final" || state.status === "failed") {
      sink.emit({
        type: "plan.final",
        data: {
          planId: id,
          status: state.status,
          confirmedSteps: state.final?.confirmedSteps ?? [],
          failedSteps: state.final?.failedSteps ?? [],
          txHashes: state.final?.txHashes ?? [],
        },
        ts: nowIso(),
      });
      return;
    }

    // Watch: confirm steps after the mock finality delay, then finalize.
    let lastHeartbeat = Date.now();
    while (!signal.aborted) {
      const current = loadStore().plans.find((p) => p.plan.planId === id);
      if (!current) return;

      let changed = false;
      for (const step of current.plan.steps) {
        if (step.status !== "submitted") continue;
        const at = step.submittedAt ? new Date(step.submittedAt).getTime() : 0;
        if (Date.now() - at >= confirmMs) {
          step.status = "confirmed";
          step.confirmedAt = nowIso();
          changed = true;
          sink.emit({
            type: "step.confirmed",
            data: {
              planId: id,
              stepId: step.stepId,
              txHash: step.txHash ?? ("0x" + "0".repeat(64)) as `0x${string}`,
              explorerUrl: step.explorerUrl ?? "",
              gasUsedUsdc: (2_000_000_000_000_000n).toString(),
            },
            ts: nowIso(),
          });
        }
      }
      if (changed) {
        const next = recompute(current.plan);
        if (next.status === "final" || next.status === "failed") {
          sink.emit({
            type: "plan.final",
            data: {
              planId: id,
              status: next.status,
              confirmedSteps: next.final?.confirmedSteps ?? [],
              failedSteps: next.final?.failedSteps ?? [],
              txHashes: next.final?.txHashes ?? [],
            },
            ts: nowIso(),
          });
          saveStore();
          return;
        }
      }

      if (Date.now() - lastHeartbeat >= 30_000) {
        sink.raw(`: keepalive ${Date.now()}\n\n`);
        lastHeartbeat = Date.now();
      }
      await sleep(400);
    }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));