/**
 * Deploys (and/or seeds) the PayrailRouter on a supported testnet with the
 * wallet from scripts/.env. Idempotent: skips deploy/seed when already present.
 * Seed amounts are modest so the payer keeps room for e2e assertions.
 *
 * Chains: arc-testnet (default), base-sepolia, base-mainnet.
 * Arc pair: USDC (native 0x3600..00) < EURC; Base pair: USDC < WETH.
 * Base mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.
 *
 * Usage:
 *   tsx scripts/deploy-router.ts [--chain arc-testnet|base-sepolia|base-mainnet]
 *                                [--force-seed] [--seed-pair0 N] [--seed-pair1 N]
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, parseAbi } from "viem";
import {
  requireWallet,
  requireBaseWallet,
  requireBaseMainnetWallet,
  sendAndWait,
  USDC_ADDRESS,
  EURC_ADDRESS,
  BASE_USDC_ADDRESS,
  BASE_WETH_ADDRESS,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_MAINNET_WETH_ADDRESS,
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
const chainFlag = ((): "arc-testnet" | "base-sepolia" | "base-mainnet" => {
  const i = argv.indexOf("--chain");
  const v = i >= 0 ? argv[i + 1] : "arc-testnet";
  if (v !== "arc-testnet" && v !== "base-sepolia" && v !== "base-mainnet") {
    throw new Error(`unknown --chain ${v}; expected arc-testnet, base-sepolia, or base-mainnet`);
  }
  return v;
})();
const argBig = (flag: string, fallback: bigint): bigint => {
  const i = argv.indexOf(flag);
  return i >= 0 ? BigInt(argv[i + 1] ?? "0") : fallback;
};

type DeployTarget = {
  name: string;
  wallet: ReturnType<typeof requireWallet>;
  routerEnvKey: string;
  token0: string; // sorted constructor pair (address order)
  token1: string;
  token0Name: string;
  token1Name: string;
  seed0: bigint;
  seed1: bigint;
};

function target(): DeployTarget {
  if (chainFlag === "base-mainnet") {
    // 0x833589.. (USDC) < 0x4200.. (WETH): already sorted.
    return {
      name: "Base Mainnet",
      wallet: requireBaseMainnetWallet(),
      routerEnvKey: "PAYRAIL_ROUTER_ADDRESS_BASE",
      token0: BASE_MAINNET_USDC_ADDRESS,
      token1: BASE_MAINNET_WETH_ADDRESS,
      token0Name: "USDC",
      token1Name: "WETH",
      seed0: argBig("--seed-pair0", 10n * USDC_DECS),
      seed1: argBig("--seed-pair1", 10_000_000_000_000_000n), // 0.01 ETH of WETH
    };
  }
  if (chainFlag === "base-sepolia") {
    // 0x036CbD.. (USDC) < 0x4200.. (WETH): already sorted.
    return {
      name: "Base Sepolia",
      wallet: requireBaseWallet(),
      routerEnvKey: "PAYRAIL_ROUTER_ADDRESS_BASESEPOLIA",
      token0: BASE_USDC_ADDRESS,
      token1: BASE_WETH_ADDRESS,
      token0Name: "USDC",
      token1Name: "WETH",
      seed0: argBig("--seed-pair0", 10n * USDC_DECS),
      seed1: argBig("--seed-pair1", 10_000_000_000_000_000n), // 0.01 ETH of WETH
    };
  }
  // 0x3600.. (USDC) < 0x89B5.. (EURC): already sorted.
  return {
    name: "Arc Testnet",
    wallet: requireWallet(),
    routerEnvKey: "PAYRAIL_ROUTER_ADDRESS_TESTNET",
    token0: USDC_ADDRESS,
    token1: EURC_ADDRESS,
    token0Name: "USDC",
    token1Name: "EURC",
    seed0: argBig("--seed-pair0", 10n * USDC_DECS),
    seed1: argBig("--seed-pair1", 8_800_000n),
  };
}

async function main() {
  const t = target();

  let router = loadEnvFile()[t.routerEnvKey] as `0x${string}` | undefined;
  const code = router ? await t.wallet.publicClient.getCode({ address: router }) : null;

  if (!router || !code || code === "0x") {
    const hash = await t.wallet.walletClient.deployContract({
      abi: artifact.abi as any,
      bytecode: artifact.bytecode as `0x${string}`,
      args: [t.token0, t.token1, 30n],
      account: t.wallet.account,
    });
    const receipt = await t.wallet.publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error("deploy produced no contract address");
    router = receipt.contractAddress;
    console.log(`deployed PayrailRouter at ${router} (tx ${hash})`);
  } else {
    console.log(`router already deployed at ${router}`);
  }

  const seeded = (await t.wallet.publicClient.readContract({
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
        args: [router, t.seed0],
      });
      await sendAndWait(t.wallet, t.token0, approve);
      const approveE = encodeFunctionData({
        abi: erc20Abi as any,
        functionName: "approve",
        args: [router, t.seed1],
      });
      await sendAndWait(t.wallet, t.token1, approveE);

      const seed = encodeFunctionData({
        abi: parseAbi([
          "function seedPool(uint256 amount0, uint256 amount1) returns (uint256 r0, uint256 r1)",
        ] as const) as any,
        functionName: "seedPool",
        args: [t.seed0, t.seed1],
      });
      const { hash } = await sendAndWait(t.wallet, router, seed);
      console.log(`seeded pool (${t.seed0} ${t.token0Name} / ${t.seed1} ${t.token1Name}) ${hash}`);
    }
  }

  const [r0, r1] = (await t.wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function getReserves() view returns (uint256, uint256)"] as const),
    functionName: "getReserves",
  })) as [bigint, bigint];
  const feeBps = (await t.wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function feeBps() view returns (uint256)"] as const),
    functionName: "feeBps",
  })) as bigint;
  const owner = (await t.wallet.publicClient.readContract({
    address: router,
    abi: parseAbi(["function owner() view returns (address)"] as const),
    functionName: "owner",
  })) as string;

  console.log(`[${t.name}] owner=${owner} reserves=(${r0},${r1}) feeBps=${feeBps}`);
  setEnvValue(t.routerEnvKey, router);
  console.log(`\nexport ${t.routerEnvKey}=${router}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});