import type { Chain } from "viem";
import { getChain } from "@payrail/api/liquidity";
import type { ChainName } from "../config.js";

/** Minimal viem Chain for Arc derived from the shared CHAIN_CONFIG (gateway is USDC). */
export function arcViemChain(chain: ChainName): Chain {
  const cfg = getChain(chain);
  return {
    id: cfg.chainId,
    name: chain === "mainnet" ? "Arc Mainnet" : "Arc Testnet",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
    blockExplorers: {
      default: { name: "Arc Explorer", url: cfg.explorerUrl },
    },
    testnet: chain === "testnet",
  } as const;
}