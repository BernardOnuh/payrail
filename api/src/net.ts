/**
 * On-chain I/O seam for the payout pipeline. The API never holds keys — the
 * walletClient here is only used for eth_estimateGas (from = an address is a
 * valid placeholder for estimation) and read-only calls.
 */

import { createPublicClient, http, type Hash, type Hex } from "viem";
import { getChain, getToken } from "./liquidity/chainConfig.js";
import type { ChainKey, TokenKey } from "./liquidity/types.js";
import { erc20Abi } from "./liquidity/abi.js";

export interface SwapReserves {
  reserve0: bigint;
  reserve1: bigint;
  seeded: boolean;
  feeBps: bigint;
}

export interface ReceiptInfo {
  status: "success" | "reverted";
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}

/**
 * Minimal network surface used by the pipeline. Implementations are trivial to
 * stub in tests (offline determinism).
 */
export interface Net {
  getNativeBalance(chain: ChainKey, address: Hex): Promise<bigint>;
  getTokenBalance(chain: ChainKey, token: TokenKey, address: Hex): Promise<bigint>;
  /** Estimate gas (in gas units) for a tx from `from`. */
  estimateGas(chain: ChainKey, from: Hex, to: Hex, data: Hex, value: bigint): Promise<bigint>;
  /** Current base fee in gas-currency wei. Falls back to chain.minGasGwei on a read error. */
  baseFeeWei(chain: ChainKey): Promise<bigint>;
  getRouterReserves(chain: ChainKey, router: Hex): Promise<SwapReserves>;
  waitForTx(chain: ChainKey, hash: Hash, timeoutMs?: number): Promise<ReceiptInfo>;
}

const clients = new Map<string, ReturnType<typeof createPublicClient>>();

function clientFor(chain: ChainKey) {
  let c = clients.get(chain);
  if (!c) {
    c = createPublicClient({ transport: http(getChain(chain).rpcUrl) });
    clients.set(chain, c);
  }
  return c;
}

export class ViemNet implements Net {
  async getNativeBalance(chain: ChainKey, address: Hex): Promise<bigint> {
    return clientFor(chain).getBalance({ address });
  }

  async getTokenBalance(chain: ChainKey, token: TokenKey, address: Hex): Promise<bigint> {
    const info = getToken(chain, token);
    const client = clientFor(chain);
    const balance = await client.readContract({
      address: info.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    return balance;
  }

  async estimateGas(chain: ChainKey, from: Hex, to: Hex, data: Hex, value: bigint): Promise<bigint> {
    const client = clientFor(chain);
    const gas = await client.estimateGas({ account: from, to, data, value });
    return gas;
  }

  async baseFeeWei(chain: ChainKey): Promise<bigint> {
    try {
      const block = await clientFor(chain).getBlock({ blockTag: "latest" });
      const base = block.baseFeePerGas ?? null;
      if (base != null && base > 0n) return base;
    } catch {
      /* fall through to the conservative chain default */
    }
    return BigInt(getChain(chain).minGasGwei) * 1_000_000_000n;
  }

  async getRouterReserves(chain: ChainKey, router: Hex): Promise<SwapReserves> {
    const client = clientFor(chain);
    const seededAbi = [
      { name: "seeded", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
    ] as const;
    const reservesAbi = [
      {
        name: "getReserves",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [
          { name: "reserve0", type: "uint256" },
          { name: "reserve1", type: "uint256" },
        ],
      },
    ] as const;
    const feeAbi = [
      { name: "feeBps", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
    ] as const;

    const seeded = (await client.readContract({
      address: router,
      abi: seededAbi,
      functionName: "seeded",
    })) as boolean;
    const reserves = (await client.readContract({
      address: router,
      abi: reservesAbi,
      functionName: "getReserves",
    })) as [bigint, bigint];
    const feeBps = (await client.readContract({
      address: router,
      abi: feeAbi,
      functionName: "feeBps",
    })) as bigint;

    return { reserve0: reserves[0], reserve1: reserves[1], seeded, feeBps };
  }

  async waitForTx(chain: ChainKey, hash: Hash, timeoutMs = 120_000): Promise<ReceiptInfo> {
    const receipt = await clientFor(chain).waitForTransactionReceipt({ hash, timeout: timeoutMs });
    return {
      status: receipt.status,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
    };
  }
}

/** Router addresses are env-driven so each chain can point at a deployed router. */
export function routerAddressFor(chain: ChainKey): Hex | undefined {
  const envKeys: Record<ChainKey, string> = {
    mainnet: "PAYRAIL_ROUTER_ADDRESS_MAINNET",
    testnet: "PAYRAIL_ROUTER_ADDRESS_TESTNET",
    basesepolia: "PAYRAIL_ROUTER_ADDRESS_BASESEPOLIA",
  };
  const raw = process.env[envKeys[chain]];
  if (!raw) return undefined;
  const v = raw as Hex;
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? v : undefined;
}