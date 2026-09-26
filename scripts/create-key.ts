/**
 * CLI to create a Payrail API key in scripts/db/keys.sqlite (default) and print
 * the raw key secret exactly once.
 *
 * Usage:
 *   npx tsx scripts/create-key.ts <name> [--db <path>] [--cap <USDC base units>]
 *     [--tokens USDC,EURC] [--slippage-bps 100] [--rpm 1000]
 *
 * Example:
 *   npx tsx scripts/create-key.ts operator --cap 20000000
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openKeyStore, type ApiKeyPolicy } from "@payrail/api";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
if (!name) {
  console.error("usage: tsx scripts/create-key.ts <name> [options]");
  process.exit(2);
}

const opt = (flag: string, fallback: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
};
const dbPath = opt("--db", path.join(ROOT, "scripts", "db", "keys.sqlite"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const policy: ApiKeyPolicy = {
  name,
  maxTotalPerRequest: BigInt(opt("--cap", "20000000")),
  allowedTokens: (opt("--tokens", "USDC,EURC").split(",") as ApiKeyPolicy["allowedTokens"]),
  maxSlippageBps: Number(opt("--slippage-bps", "100")),
  requestsPerMinute: Number(opt("--rpm", "1000")),
};

const { raw } = openKeyStore(dbPath).createKey(name, policy);
console.log(`created key "${name}" in ${dbPath}`);
console.log(`X-API-Key: ${raw}`);
console.log("store this secret now; it will not be shown again");