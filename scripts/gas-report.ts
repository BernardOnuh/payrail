/**
 * Real on-chain gas report for Payrail payout plans on Arc TESTNET.
 *
 * Sends three USDC-only batches (1 / 10 / 100 recipients) through the live API
 * against the deployed PayrailRouter, signs+broadcasts each step with the
 * payer wallet, and reports the actual gas consumed (npm docs/GAS.md).
 *
 * Preconditions:
 *   scripts/.env with ARC_TESTNET_* for a funded wallet
 *   npx tsx scripts/deploy-router.ts
 *   PAYRAIL_ROUTER_ADDRESS_TESTNET in scripts/.env
 *
 * Usage: npx tsx scripts/gas-report.ts [--per-recipient 10000] [--dry-run]
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openKeyStore } from "@payrail/api";
import type { ApiKeyPolicy } from "@payrail/api";
import { requireWallet, sendAndWait, loadEnvFile } from "./lib/env.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_TS = path.join(ROOT, "api", "src", "main.ts");
const TSX_BIN = path.join(ROOT, "scripts", "node_modules", ".bin", "tsx");

const PER_RECIPIENT = BigInt(process.argv.includes("--per-recipient")
  ? process.argv[process.argv.indexOf("--per-recipient") + 1]
  : "10000");
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;

interface BatchResult {
  count: number;
  gasUsedUnits: bigint;
  gasWei: bigint;
  effectiveGasPriceWei: bigint;
  success: boolean;
}

async function startServer(env: Record<string, string>) {
  const child = spawn(TSX_BIN, [MAIN_TS], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise<number>((resolve, reject) => {
    let buf = "";
    const t = setTimeout(() => reject(new Error("server not ready")), 30_000);
    child.stdout!.on("data", (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/listening on :(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
  return { port, kill: () => child.kill("SIGTERM") };
}

async function runBatch(base: string, apiKey: string, payer: `0x${string}`, count: number, wallet: ReturnType<typeof requireWallet>): Promise<BatchResult> {
  const payments = Array.from({ length: count }, (_, i) => ({
    recipient: `0x${(i + 1).toString(16).padStart(2, "0")}` + "ab".repeat(19),
    amount: PER_RECIPIENT.toString(),
    currency: "USDC",
  }));

  const created = await fetch(`${base}/v1/payout`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      chain: "testnet",
      payer,
      sourceToken: "USDC",
      memo: `gas-report batch n=${count}`,
      payments,
    }),
  });
  if (created.status !== 200) {
    return { count, gasUsedUnits: 0n, gasWei: 0n, effectiveGasPriceWei: 0n, success: false };
  }
  const { plan } = (await created.json()) as { plan: Record<string, any> };
  if (plan.steps[0].type !== "approve" || plan.steps[1].type !== "batchPayout") {
    throw new Error(`unexpected steps for USDC batch: ${plan.steps.map((s: any) => s.type).join(",")}`);
  }

  let gasWei = 0n;
  let gasUnits = 0n;
  let effectiveGasPriceWei = 0n;
  for (const step of plan.steps) {
    const { hash, gasUsed, effectiveGasPrice } = await sendAndWait(
      wallet,
      step.tx.to as `0x${string}`,
      step.tx.data as `0x${string}`,
      BigInt(step.tx.value),
    );
    if (VERBOSE) {
      console.log(`    ${step.type} gasUsed=${gasUsed} gasPrice=${effectiveGasPrice} hash=${hash.slice(0, 12)}`);
    }
    const sub = await fetch(`${base}/v1/plan/${plan.planId}/submitted`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ stepId: step.stepId, txHash: hash }),
    });
    if (sub.status !== 200) throw new Error(`submit step ${step.stepId}: HTTP ${sub.status}`);
    gasWei += gasUsed * effectiveGasPrice;
    gasUnits += gasUsed;
    effectiveGasPriceWei += effectiveGasPrice;
  }
  return { count, gasUsedUnits: gasUnits, gasWei, effectiveGasPriceWei: effectiveGasPriceWei / BigInt(plan.steps.length || 1), success: true };
}

async function main() {
  const wallet = requireWallet();
  const envFile = loadEnvFile();
  const router = envFile.PAYRAIL_ROUTER_ADDRESS_TESTNET as `0x${string}` | undefined;
  if (!router) throw new Error("PAYRAIL_ROUTER_ADDRESS_TESTNET not set — run scripts/deploy-router.ts first");

  const tmpDir = path.join(ROOT, "scripts", "db");
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `gas-report-${Date.now()}.sqlite`);
  const policy: ApiKeyPolicy = {
    name: "gas-report",
    maxTotalPerRequest: 100_000_000n * 10n,
    allowedTokens: ["USDC", "EURC"],
    maxSlippageBps: 100,
    requestsPerMinute: 10_000,
  };
  const { raw: apiKey } = openKeyStore(dbPath).createKey("gas-report", policy);

  let srv: { port: number; kill: () => void } | undefined;
  try {
    srv = await startServer({ PAYRAIL_DB_PATH: dbPath, PAYRAIL_PORT: "0", PAYRAIL_ROUTER_ADDRESS_TESTNET: router, PAYRAIL_QUOTE_TTL_SECONDS: "300" });
    const base = `http://127.0.0.1:${srv.port}`;
    const header = { "X-API-Key": apiKey, "Content-Type": "application/json" };

    console.log(`gas-report: per-recipient ${PER_RECIPIENT} USDC base units (6-dec)`);
    console.log(`router: ${router}`);
    console.log(`payer: ${wallet.address}`);
    if (DRY_RUN) {
      for (const n of [1, 10, 100]) {
        const r = await runBatch(base, apiKey, wallet.address, n, wallet);
        console.log(`dry ${n}: created plan ${r.success ? "OK" : "FAILED"}`);
      }
      return;
    }

    const rows: BatchResult[] = [];
    for (const n of [1, 10, 100]) {
      const r = await runBatch(base, apiKey, wallet.address, n, wallet);
      rows.push(r);
      const gasUsdc6 = r.gasWei / 1_000_000_000_000n;
      const perRecipientGas = r.count ? gasUsdc6 / BigInt(r.count) : 0n;
      console.log(
        `batch n=${r.count}: gas ${gasUsdc6} base USDC · ${r.gasUsedUnits} units · ${perRecipientGas} base/recipient · ${r.success ? "OK" : "FAILED"}`,
      );
    }

    console.log("\nGas report (Arc Testnet, native USDC gas):");
    console.log("| recipients | gas (units) | gas (base USDC) | gas (base/recipient) |");
    console.log("|---|---|---|---|");
    for (const r of rows) {
      const gasUsdc6 = r.gasWei / 1_000_000_000_000n;
      console.log(`| ${r.count} | ${r.gasUsedUnits} | ${gasUsdc6} | ${r.count ? gasUsdc6 / BigInt(r.count) : 0n} |`);
    }
    console.log(`\navg effective gas price: ${(rows.reduce((a, r) => a + r.effectiveGasPriceWei, 0n) / BigInt(rows.length || 1)).toString()} wei/gas`);
  } finally {
    srv?.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});