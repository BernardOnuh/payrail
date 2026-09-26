/**
 * Recycles router pool reserves back to the payer and re-deploys a fresh,
 * balanced PayrailRouter. Use when the testnet wallet + pool are drained by
 * E2E payout runs and the faucet isn't convenient.
 *
 * Steps:
 *   1. rescue() both pool tokens (USDC, EURC) from the current router to the
 *      payer (owner-only call).
 *   2. Remove PAYRAIL_ROUTER_ADDRESS_TESTNET from scripts/.env.
 *   3. Re-run scripts/deploy-router.ts (fresh deploy + seed, updates .env).
 *
 * Usage: npx tsx scripts/recycle-router.ts
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { requireWallet, sendAndWait, loadEnvFile, USDC_ADDRESS, EURC_ADDRESS } from "./lib/env.js";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPTS_DIR);
const TSX_BIN = path.join(SCRIPTS_DIR, "node_modules", ".bin", "tsx");
const ENV_PATH = path.join(SCRIPTS_DIR, ".env");

const rescueAbi = parseAbi(["function rescue(address token, address to, uint256 amount)"] as const);

async function rescueToken(wallet: ReturnType<typeof requireWallet>, router: Hex, token: Hex, payer: Hex): Promise<void> {
  const bal = (await wallet.publicClient.readContract({
    address: token,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"] as const),
    functionName: "balanceOf",
    args: [router],
  })) as bigint;
  if (bal === 0n) {
    console.log(`rescue ${token.slice(0, 8)}…: 0 balance, skipping`);
    return;
  }
  const data = encodeFunctionData({ abi: rescueAbi, functionName: "rescue", args: [token, payer, bal] });
  const { hash } = await sendAndWait(wallet, router, data);
  console.log(`rescued ${bal} of ${token.slice(0, 8)}… -> ${payer.slice(0, 8)}… ${hash}`);
}

async function main() {
  const wallet = requireWallet();
  const envFile = loadEnvFile();
  const router = envFile.PAYRAIL_ROUTER_ADDRESS_TESTNET as Hex | undefined;
  if (!router) throw new Error("no router in scripts/.env to recycle");

  console.log(`recycling router ${router}`);
  if (wallet.address.toLowerCase() !== envFile.ARC_TESTNET_ADDRESS!.toLowerCase()) {
    throw new Error("payer does not match .env wallet");
  }

  await rescueToken(wallet, router, USDC_ADDRESS as Hex, wallet.address);
  await rescueToken(wallet, router, EURC_ADDRESS as Hex, wallet.address);

  // Drop the router from .env so deploy-router performs a fresh deploy.
  const lines = readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l: string) => !l.startsWith("PAYRAIL_ROUTER_ADDRESS_TESTNET="));
  writeFileSync(ENV_PATH, lines.join("\n") + "\n");
  console.log("deploying fresh router + seeding pool…");

const flash = process.argv.slice(2);
await new Promise<void>((resolve, reject) => {
  const child = spawn(TSX_BIN, ["deploy-router.ts", ...flash], { cwd: SCRIPTS_DIR, stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`deploy-router exited ${code}`))));
});

  console.log(`\nnew router: ${loadEnvFile().PAYRAIL_ROUTER_ADDRESS_TESTNET}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});