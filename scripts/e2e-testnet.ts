/**
 * End-to-end test on Arc TESTNET against the real HTTP server.
 *
 * Preconditions:
 *   scripts/.env with ARC_TESTNET_* for the funded "pioneer" wallet
 *   npx tsx scripts/deploy-router.ts       (deploys + seeds PayrailRouter)
 *   PAYRAIL_ROUTER_ADDRESS_TESTNET in scripts/.env
 *
 * Flow:
 *   1. Creates a fresh sqlite DB + API key, spawns the real API server.
 *   2. Creates a 3-recipient payout plan (2 USDC recipients via batch,
 *      1 EURC recipient via swap) through HTTP.
 *   3. Signs/broadcasts each step with the payer wallet, submits hashes,
 *      follows the SSE stream over real HTTP to plan.final.
 *   4. Asserts all steps confirmed and recipient balances changed by the
 *      EXACT amounts in the plan; pool reserves updated exactly.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openKeyStore } from "@payrail/api";
import type { ApiKeyPolicy } from "@payrail/api";
import { requireWallet, sendAndWait, loadEnvFile, erc20Abi } from "./lib/env.js";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as `0x${string}`;

const EURC_PAYOUT = 2_000_000n; // 2.00 EURC
const USDC_PAYOUT_A = 1_500_000n; // 1.50 USDC
const USDC_PAYOUT_B = 500_000n; // 0.50 USDC

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_TS = path.join(ROOT, "api", "src", "main.ts");
const TSX_BIN = path.join(ROOT, "scripts", "node_modules", ".bin", "tsx");

async function startServer(env: Record<string, string>): Promise<{ port: number; kill: () => void }> {
  const child = spawn(TSX_BIN, [MAIN_TS], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("server did not report ready")), 30_000);
    child.stdout!.on("data", (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/listening on :(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.on("exit", (code) => reject(new Error(`server exited early (code ${code})`)));
  });
  return { port: Number(port), kill: () => child.kill("SIGTERM") };
}

async function main() {
  const wallet = requireWallet();
  const envFile = loadEnvFile();
  const router = envFile.PAYRAIL_ROUTER_ADDRESS_TESTNET as `0x${string}` | undefined;
  assert(router, "PAYRAIL_ROUTER_ADDRESS_TESTNET not set — run scripts/deploy-router.ts first");
  assert((await wallet.publicClient.getCode({ address: router })) != null, `no code at router ${router}`);
  const seeded = (await wallet.publicClient.readContract({
    address: router,
    abi: [{ name: "seeded", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] }],
    functionName: "seeded",
  })) as boolean;
  assert(seeded, "router pool not seeded");

  const r1 = "0x" + "11".repeat(20) as `0x${string}`;
  const r2 = "0x" + "22".repeat(20) as `0x${string}`;
  const r3 = "0x" + "33".repeat(20) as `0x${string}`;

  const bal = (token: `0x${string}`, addr: string) =>
    wallet.publicClient.readContract({
      address: token,
      abi: erc20Abi as any,
      functionName: "balanceOf",
      args: [addr],
    }) as unknown as Promise<bigint>;

  const pre = {
    r1Eurc: await bal(EURC_ADDRESS, r1),
    r2Usdc: await bal(USDC_ADDRESS, r2),
    r3Usdc: await bal(USDC_ADDRESS, r3),
    payerUsdc: await bal(USDC_ADDRESS, wallet.address),
    payerNative: await wallet.publicClient.getBalance({ address: wallet.address }),
  };
  const [res0, res1] = (await wallet.publicClient.readContract({
    address: router,
    abi: [
      { name: "getReserves", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "a", type: "uint256" }, { name: "b", type: "uint256" }] },
    ],
    functionName: "getReserves",
  })) as [bigint, bigint];

  // -----------------------------------------------------------------
  // 1) spawn the API server over real HTTP
  // -----------------------------------------------------------------
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "payrail-e2e-"));
  const dbPath = path.join(tmpDir, "payrail.sqlite");
  const policy: ApiKeyPolicy = {
    name: "e2e",
    maxTotalPerRequest: 20_000_000n,
    allowedTokens: ["USDC", "EURC"],
    maxSlippageBps: 100,
    requestsPerMinute: 1000,
  };
  const { raw: apiKey } = openKeyStore(dbPath).createKey("e2e", policy);
  const srv = await startServer({
    PAYRAIL_DB_PATH: dbPath,
    PAYRAIL_PORT: "0",
    PAYRAIL_QUOTE_TTL_SECONDS: "300",
    PAYRAIL_ROUTER_ADDRESS_TESTNET: router,
  });
  const base = `http://127.0.0.1:${srv.port}`;
  const apiKeyHeader = { "X-API-Key": apiKey, "Content-Type": "application/json" };

  const events: { type: string; data: any }[] = [];
  let sseChunks = 0;
  const sseAbort = new AbortController();
  let streamRead: Promise<void> | undefined;

  try {
    // -----------------------------------------------------------------
    // 2) create the payout plan
    // -----------------------------------------------------------------
    const payoutBody = {
      chain: "testnet",
      payer: wallet.address,
      sourceToken: "USDC",
      memo: "e2e-testnet three-recipient flow",
      payments: [
        { recipient: r1, amount: EURC_PAYOUT.toString(), currency: "EURC" },
        { recipient: r2, amount: USDC_PAYOUT_A.toString(), currency: "USDC" },
        { recipient: r3, amount: USDC_PAYOUT_B.toString(), currency: "USDC" },
      ],
    };
    const created = await fetch(`${base}/v1/payout`, { method: "POST", headers: apiKeyHeader, body: JSON.stringify(payoutBody) });
    const createdStatus = created.status;
    const createdBody = createdStatus === 200 ? null : await created.text();
    assert(createdStatus === 200, `payout create: HTTP ${createdStatus} — ${createdBody}`);
    const { plan } = (await created.json()) as { plan: Record<string, any> };
    assert(plan.steps.length === 3, "expected 3 plan steps");
    assert(plan.steps[0].type === "approve", "step 0 must be approve");
    assert(plan.steps[1].type === "swap", "step 1 must be swap");
    assert(plan.steps[2].type === "batchPayout", "step 2 must be batchPayout");
    const planId = plan.planId as string;

    const swapAmountIn = BigInt(plan.steps[1].amountIn);
    const swapAmountOut = BigInt(plan.steps[1].amountOut);
    const sourceTokenSpent = BigInt(plan.totals.sourceTokenSpent);
    assert(swapAmountIn > 0n && swapAmountOut >= EURC_PAYOUT, "swap amounts invalid");
    assert(Date.parse(plan.quoteExpiresAt) > Date.now(), "quote should be valid now");

    console.log(`plan ${planId}`);
    console.log(`  approve ${plan.steps[0].amount} USDC -> router`);
    console.log(`  swap    ${swapAmountIn} USDC -> ${swapAmountOut} EURC -> ${r1}`);
    console.log(`  batch   ${USDC_PAYOUT_A} + ${USDC_PAYOUT_B} USDC`);
    console.log(`  source spent ${sourceTokenSpent}, fees=${plan.totals.feesUsdc}, gasEst=${plan.totals.estimatedGasUsdc}`);

    // 3a) open the SSE stream before submitting steps
    streamRead = (async () => {
      const res = await fetch(`${base}/v1/stream/${planId}`, { headers: apiKeyHeader, signal: sseAbort.signal }).catch(() => null);
      if (!res || res.status !== 200) return;
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseChunks++;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (dataLine) events.push(JSON.parse(dataLine.slice(6)));
        }
      }
    })();

    // -----------------------------------------------------------------
    // 3b) sign+broadcast each step in order, following SSE confirmations
    // -----------------------------------------------------------------
    const stepHashes: string[] = [];
    let totalGasWei = 0n;
    for (let stepId = 0; stepId < plan.steps.length; stepId++) {
      const step = plan.steps[stepId];
      const { hash, gasUsed, effectiveGasPrice } = await sendAndWait(
        wallet,
        step.tx.to as `0x${string}`,
        step.tx.data as `0x${string}`,
        BigInt(step.tx.value),
      );
      totalGasWei += gasUsed * effectiveGasPrice;
      stepHashes.push(hash);
      console.log(`  step ${stepId} txs ${hash}`);

      const sub = await fetch(`${base}/v1/plan/${planId}/submitted`, {
        method: "POST",
        headers: apiKeyHeader,
        body: JSON.stringify({ stepId, txHash: hash }),
      });
      const subStatus = sub.status;
      const subBody = subStatus === 200 ? null : await sub.text();
      assert(subStatus === 200, `submit step ${stepId}: HTTP ${subStatus} — ${subBody}`);

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline && !events.some((e) => e.type === "step.confirmed" && e.data.stepId === stepId)) {
        await sleep(500);
      }
      assert(
        events.some((e) => e.type === "step.confirmed" && e.data.stepId === stepId),
        `step ${stepId} never confirmed via SSE — events seen: ${JSON.stringify(events.map((e) => ({ type: e.type, stepId: e.data?.stepId, status: e.data?.status })))}`,
      );
      console.log(`  step ${stepId} confirmed`);
    }

    const finalDeadline = Date.now() + 30_000;
    while (Date.now() < finalDeadline && !events.some((e) => e.type === "plan.final")) await sleep(300);
    const final = events.find((e) => e.type === "plan.final");
    assert(final != null, "plan.final never arrived via SSE");
    assert(final.data.status === "final", `expected final, got ${final.data.status}`);
    assert(final.data.confirmedSteps.length === 3, `confirmed steps ${final.data.confirmedSteps.join(",")}`);
    assert(final.data.txHashes.length === 3, "expected 3 tx hashes on final");
    for (const h of stepHashes) assert(final.data.txHashes.includes(h), "final missing a step hash");

    // -----------------------------------------------------------------
    // 4) exact balance + reserve assertions
    // -----------------------------------------------------------------
    await sleep(2_000);
    const post = {
      r1Eurc: await bal(EURC_ADDRESS, r1),
      r2Usdc: await bal(USDC_ADDRESS, r2),
      r3Usdc: await bal(USDC_ADDRESS, r3),
      payerUsdc: await bal(USDC_ADDRESS, wallet.address),
      payerNative: await wallet.publicClient.getBalance({ address: wallet.address }),
    };
    const [postR0, postR1] = (await wallet.publicClient.readContract({
      address: router,
      abi: [
        { name: "getReserves", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "a", type: "uint256" }, { name: "b", type: "uint256" }] },
      ],
      functionName: "getReserves",
    })) as [bigint, bigint];

    assert(post.r1Eurc - pre.r1Eurc === swapAmountOut, `r1 EURC delta ${post.r1Eurc - pre.r1Eurc} != ${swapAmountOut}`);
    assert(post.r2Usdc - pre.r2Usdc === USDC_PAYOUT_A, `r2 USDC delta ${post.r2Usdc - pre.r2Usdc} != ${USDC_PAYOUT_A}`);
    assert(post.r3Usdc - pre.r3Usdc === USDC_PAYOUT_B, `r3 USDC delta ${post.r3Usdc - pre.r3Usdc} != ${USDC_PAYOUT_B}`);

    // 0x3600 is BOTH the swap token and Arc's native gas token, so the payer
    // balance delta is source-token spend plus gas, all in the same 6-dec units.
    const gasUsdc6 = totalGasWei / 1_000_000_000_000n; // 18-dec wei -> 6-dec
    const payerDelta = pre.payerUsdc - post.payerUsdc;
    assert(
      payerDelta >= sourceTokenSpent && payerDelta <= sourceTokenSpent + gasUsdc6 + 1n,
      `payer USDC delta ${payerDelta} outside ${sourceTokenSpent}..${sourceTokenSpent + gasUsdc6 + 1n} (gas ${gasUsdc6})`,
    );
    console.log(`  payer USDC delta ${payerDelta} = source ${sourceTokenSpent} + gas ${gasUsdc6}`);
    assert(postR0 - res0 === swapAmountIn, `reserve0 delta ${postR0 - res0} != ${swapAmountIn}`);
    assert(postR1 === res1 - swapAmountOut, `reserve1 delta ${res1 - postR1} != ${swapAmountOut}`);

    console.log("\nE2E PASS");
    console.log(`  payer native spent ≈ ${formatNative(pre.payerNative - post.payerNative)} USDC`);
    console.log(`  steps confirmed: ${final.data.confirmedSteps.join(",")}`);
    console.log(`  txHashes: ${final.data.txHashes.join(",")}`);
    console.log(`  sse chunks: ${sseChunks}, events: ${events.map((e) => e.type).join(",")}`);
  } finally {
    sseAbort.abort();
    void streamRead?.catch(() => {});
    await sleep(200);
    srv.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function formatNative(wei: bigint): string {
  const base = 10n ** 12n;
  return `${wei / base}.${(wei % base).toString().padStart(12, "0").slice(0, 6)}`;
}

main().catch((e) => {
  console.error("\nE2E FAIL:", e);
  process.exit(1);
});