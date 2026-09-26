import type { Chain } from "viem";
import { getChain } from "@payrail/api/liquidity";
import type { ChainName } from "../config.js";

const ARC_NAMES: Record<ChainName, string> = {
  mainnet: "Arc Mainnet",
  testnet: "Arc Testnet",
  basesepolia: "Base Sepolia",
  base: "Base",
};

const EXPLORER_NAMES: Record<ChainName, string> = {
  mainnet: "Arc Explorer",
  testnet: "Arc Explorer",
  basesepolia: "BaseScan Sepolia",
  base: "BaseScan",
};

/** Minimal viem Chain derived from the shared CHAIN_CONFIG (native currency + RPC + explorer). */
export function buildViemChain(chain: ChainName): Chain {
  const cfg = getChain(chain);
  const eth = cfg.gasToken.symbol === "ETH";
  return {
    id: cfg.chainId,
    name: ARC_NAMES[chain],
    nativeCurrency: eth
      ? { name: "Ether", symbol: "ETH", decimals: 18 }
      : { name: "USD Coin", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
    blockExplorers: {
      default: { name: EXPLORER_NAMES[chain], url: cfg.explorerUrl },
    },
    testnet: chain !== "mainnet" && chain !== "base",
  } as const;
}