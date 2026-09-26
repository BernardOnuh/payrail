import { KeyService } from "../src/keys/service.js";
import { openKeyStore, sha256Hex, type KeyStore } from "../src/keys/store.js";
import { memPlanStore } from "../src/plans/store.js";
import { SseHub } from "../src/plans/events.js";
import { QuoteEngine } from "../src/liquidity/engine.js";
import { buildApiApp } from "../src/app.js";
import type { AppServices } from "../src/http/handlers.js";
import type { Hex, Net } from "../src/net.js";
import type { SwapReserves } from "../src/net.js";

export const TEST_ROUTER = "0x1111111111111111111111111111111111111111" as Hex;
export const TEST_PAYER = "0x2222222222222222222222222222222222222222" as Hex;
export const TEST_RECIPIENT = "0x3333333333333333333333333333333333333333" as Hex;

export const NATIVE_18 = 10n ** 18n;
export const USDC_6 = 10n ** 6n;

/** Deterministic network double; balances are mutable per token. */
export function stubNet(initial: {
  native?: bigint;
  USDC?: bigint;
  EURC?: bigint;
  reserves?: SwapReserves;
  estimateGas?: bigint;
  baseFeeWei?: bigint;
} = {}): Net & { setBalance(token: string, amount: bigint): void } {
  const o = {
    native: initial.native ?? NATIVE_18 * 100n,
    USDC: initial.USDC ?? USDC_6 * 100n,
    EURC: initial.EURC ?? USDC_6 * 100n,
    reserves: initial.reserves ?? { reserve0: USDC_6 * 10n, reserve1: USDC_6 * 8n, seeded: true, feeBps: 30n },
    estimateGas: initial.estimateGas ?? 100_000n,
    baseFeeWei: initial.baseFeeWei ?? 20n * 1_000_000_000n,
  };
  const balances: Record<string, bigint> = { native: o.native, USDC: o.USDC, EURC: o.EURC };

  return {
    async getNativeBalance() {
      return balances.native;
    },
    async getTokenBalance(_chain, token) {
      return balances[token] ?? 0n;
    },
    async estimateGas() {
      return o.estimateGas;
    },
    async baseFeeWei() {
      return o.baseFeeWei;
    },
    async getRouterReserves() {
      return o.reserves;
    },
    async waitForTx() {
      throw new Error("not implemented in stub");
    },
    setBalance(token: string, amount: bigint) {
      balances[token] = amount;
    },
  };
}

export interface TestHarness {
  app: ReturnType<typeof buildApiApp>;
  services: AppServices;
  store: KeyStore;
  rawKey: string;
  net: ReturnType<typeof stubNet>;
  apiKeyHeader: Record<string, string>;
}

/**
 * Boots the full HTTP app with the router configured on testnet so the payout
 * handler can build swap legs. Balances default to comfortably funded.
 */
export function makeHarness(opts: {
  capUsdc?: bigint;
  allowedTokens?: string[];
  ttlSeconds?: number;
  net?: ReturnType<typeof stubNet>;
} = {}): TestHarness {
  process.env.PAYRAIL_ROUTER_ADDRESS_TESTNET = TEST_ROUTER;

  const store = openKeyStore(":memory:");
  const created = store.createKey("test-key", {
    name: "test-key",
    maxTotalPerRequest: opts.capUsdc ?? USDC_6 * 20n,
    allowedTokens: opts.allowedTokens ?? ["USDC", "EURC"],
    maxSlippageBps: 100,
    requestsPerMinute: 1000,
  });

  const net = opts.net ?? stubNet();
  const services: AppServices = {
    keys: new KeyService(store),
    store: memPlanStore(),
    hub: new SseHub(),
    net,
    engine: new QuoteEngine([]),
    ttlSeconds: () => opts.ttlSeconds ?? 300,
    operatorKeyHash: sha256Hex(created.raw),
  };
  const app = buildApiApp(services);

  return {
    app,
    services,
    store,
    rawKey: created.raw,
    net,
    apiKeyHeader: { "X-API-Key": created.raw },
  };
}

export function payoutBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chain: "testnet",
    payer: TEST_PAYER,
    sourceToken: "USDC",
    payments: [{ recipient: TEST_RECIPIENT, amount: "1000000", currency: "USDC" }],
    ...overrides,
  };
}