/**
 * Deploys (and/or seeds) the PayrailRouter on Arc TESTNET with the wallet from
 * scripts/.env. Idempotent: skips deploy/seed when already present.
 * Seed amounts are modest so the payer keeps room for e2e assertions.
 *
 * Usage: tsx scripts/deploy-router.ts [--force-seed]
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, parseAbi } from "viem";
import {
  requireWallet,
  sendAndWait,
  USDC_ADDRESS,
  EURC_ADDRESS,
  erc20Abi,
  loadEnvFile,
  ENV_PATH,
} from "./lib/env.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function setEnvValue(key: string, value: string): void {
  const current = readFileSync(ENV_PATH, "utf8");
  const lines = current === "" ? [] : current.split("\n");
  const line = `${key}=${value}`;
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  let out: string[];
  if (idx >= 0) {
    out = lines.slice();
    out[idx] = line;
  } else {
    out = lines.filter((l) => l.length > 0);
    out.push(line);
  }
  writeFileSync(ENV_PATH, out.join("\n") + "\n");
}
const artifact = JSON.parse(
  readFileSync(path.join(ROOT, "contracts/export/PayrailRouter.json"), "utf8"),
) as { abi: unknown; bytecode: string };

const USDC_DECS = 1_000_000n; // 6-dec unit
const argv = process.argv.slice(2);
const argBig = (flag: string, fallback: bigint): bigint => {
  const i = argv.indexOf(flag);
  return i >= 0 ? BigInt(argv[i + 1] ?? "0") : fallback;
};
const SEED_USDC = argBig("--seed-usdc", 10n * USDC_DECS);
const SEED_EURC = argBig("--seed-eurc", 8_800_000n);

async function main() {
  const wallet = requireWallet();

  let router = loadEnvFile().PAYRAIL_ROUTER_ADDRESS_TESTNET as `0x${string}` | undefined;
  const code = router ? await wallet.publicClient.getCode({ address: router }) : null;

  if (!router || !code || code === "0x") {
    // USDC (0x3600...) < EURC (0x89B5...) so the constructor args are already sorted.
    const hash = await wallet.walletClient.deployContract({
      abi: artifact.abi as any,
      bytecode: artifact.bytecode as `0x${string}`,
      args: [USDC_ADDRESS, EURC_ADDRESS, 30n],
      account: wallet.account,
    });
    const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error("deploy produced no contract address");
    router = receipt.contractAddress;
    console.log(`deployed PayrailRouter at ${router} (txs ${hash})`);
  } else {
    console.log(`router already deployed at ${router}`);
  }

  const seeded = (await wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function seeded() view returns (bool)"] as const),
    functionName: "seeded",
  })) as boolean;

  if (!seeded || process.argv.includes("--force-seed")) {
    if (seeded && process.argv.includes("--force-seed")) {
      console.warn("--force-seed given but router is already seeded; refusing to corrupt reserves");
    } else if (seeded) {
      console.warn("router already seeded; skipping seed");
    } else {
      const approve = encodeFunctionData({
        abi: erc20Abi as any,
        functionName: "approve",
        args: [router, SEED_USDC],
      });
      await sendAndWait(wallet, USDC_ADDRESS, approve);
      const approveE = encodeFunctionData({
        abi: erc20Abi as any,
        functionName: "approve",
        args: [router, SEED_EURC],
      });
      await sendAndWait(wallet, EURC_ADDRESS, approveE);

      const seed = encodeFunctionData({
        abi: parseAbi([
          "function seedPool(uint256 amount0, uint256 amount1) returns (uint256 r0, uint256 r1)",
        ] as const) as any,
        functionName: "seedPool",
        args: [SEED_USDC, SEED_EURC],
      });
      const { hash } = await sendAndWait(wallet, router, seed);
      console.log(`seeded pool (${SEED_USDC} USDC / ${SEED_EURC} EURC) ${hash}`);
    }
  }

  const [r0, r1] = (await wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function getReserves() view returns (uint256, uint256)"] as const),
    functionName: "getReserves",
  })) as [bigint, bigint];
  const feeBps = (await wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function feeBps() view returns (uint256)"] as const),
    functionName: "feeBps",
  })) as bigint;
  const owner = (await wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function owner() view returns (address)"] as const),
    functionName: "owner",
  })) as string;

  console.log(`owner=${owner} reserves=(${r0},${r1}) feeBps=${feeBps}`);
  setEnvValue("PAYRAIL_ROUTER_ADDRESS_TESTNET", router);
  console.log(`\nexport PAYRAIL_ROUTER_ADDRESS_TESTNET=${router}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});