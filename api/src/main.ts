/**
 * HTTP server entrypoint. Wires real services (SQLite, viem) onto the app.
 */

import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { buildApiApp } from "./app.js";
import { ViemNet, routerAddressFor } from "./net.js";
import { QuoteEngine } from "./liquidity/engine.js";
import { defaultSources } from "./liquidity/sources/index.js";
import { openKeyStore, sha256Hex } from "./keys/store.js";
import { KeyService } from "./keys/service.js";
import { openPlanStore } from "./plans/store.js";
import { SseHub } from "./plans/events.js";
import type { ApiKeyPolicy } from "./http/schemas/keys.js";

// Load ./.env when present (Node 20.12+). Allows PAYRAIL_* config without a
// shell export step; explicit env vars take precedence over file values.
try {
  if (existsSync("./.env")) process.loadEnvFile("./.env");
} catch (e) {
  console.warn(`payrail: failed to load ./.env: ${(e as Error).message}`);
}

const port = Number(process.env.PAYRAIL_PORT ?? 3000);
const dbPath = process.env.PAYRAIL_DB_PATH ?? "payrail.sqlite";
const ttlSeconds = Number(process.env.PAYRAIL_QUOTE_TTL_SECONDS ?? 300);
const operatorKey = process.env.PAYRAIL_OPERATOR_KEY ?? "";

const net = new ViemNet();
const keyStore = openKeyStore(dbPath);
const planStore = openPlanStore(dbPath);
const hub = new SseHub();
const engine = new QuoteEngine(defaultSources(net), { timeoutMs: 5_000 });
const keys = new KeyService(keyStore);

// Bootstrap the operator credential: the raw key lives in PAYRAIL_OPERATOR_KEY
// (never printed); management endpoints compare its hash against this value.
if (operatorKey.length >= 20) {
  const operatorPolicy: ApiKeyPolicy = {
    name: "operator",
    maxTotalPerRequest: 200000000000000n, // 200,000,000 USDC base units
    allowedTokens: ["USDC", "EURC", "cirBTC", "WETH"],
    maxSlippageBps: 10_000,
    requestsPerMinute: 10_000,
  };
  if (!keyStore.findByHash(sha256Hex(operatorKey))) {
    keys.registerOperator(operatorKey, operatorPolicy);
    console.log("payrail: registered operator key (from PAYRAIL_OPERATOR_KEY)");
  }
}

const services = {
  keys,
  store: planStore,
  hub,
  net,
  engine,
  ttlSeconds: () => ttlSeconds,
  operatorKeyHash: operatorKey.length >= 20 ? sha256Hex(operatorKey) : "",
};

// Fail loudly if the operator expects a router where none is configured.
const rTestnet = routerAddressFor("testnet");
  const rMainnet = routerAddressFor("mainnet");
  const rBase = routerAddressFor("basesepolia");
  if (!rTestnet && !rMainnet && !rBase) {
    console.warn("payrail: no PAYRAIL_ROUTER_ADDRESS_* set; swap legs will be unavailable");
  }

const app = buildApiApp(services);
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`payrail api listening on :${info.port} (db=${dbPath}, quote ttl=${ttlSeconds}s)`);
});