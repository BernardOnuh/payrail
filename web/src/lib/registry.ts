/**
 * Chain + token registry for the web app.
 *
 * Everything public (no secrets). The wagmi chains are built from env values
 * (see .env.example) so the app is never hardcoded to a single Arc deployment.
 * Token addresses/decimals mirror the verified values in
 * api/src/liquidity/chainConfig.ts (recon: on-chain verified mainnet, docs-only
 * testnet for non-USDC tokens).
 */
import { defineChain, type Chain } from "viem";

export type ChainName = "mainnet" | "testnet";
export type TokenName = "USDC" | "EURC" | "cirBTC" | "WETH";

export const NATIVE_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const NATIVE_USDC_DECIMALS = 18;
export const ERC20_VIEW_DECIMALS = 6;
export const MIN_GAS_GWEI = 20;

export interface TokenMeta {
  key: TokenName;
  address: `0x${string}`;
  decimals: number;
  /** Mainnet tokens are on-chain verified; testnet non-USDC are docs-only. */
  note: "verified" | "docs-only";
}

const mainnetTokens: Record<TokenName, TokenMeta> = {
  USDC: { key: "USDC", address: NATIVE_USDC_ADDRESS, decimals: 6, note: "verified" },
  EURC: { key: "EURC", address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1", decimals: 6, note: "verified" },
  cirBTC: { key: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8, note: "verified" },
  WETH: { key: "WETH", address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB", decimals: 18, note: "verified" },
};

const testnetTokens: Record<TokenName, TokenMeta> = {
  USDC: { key: "USDC", address: NATIVE_USDC_ADDRESS, decimals: 6, note: "verified" },
  EURC: { key: "EURC", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6, note: "docs-only" },
  cirBTC: { key: "cirBTC", address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", decimals: 8, note: "docs-only" },
  WETH: { key: "WETH", address: "0x2c4047028a72803939b6fb674D01bC059B5C4961", decimals: 18, note: "docs-only" },
};

interface ChainEnvSpec {
  name: ChainName;
  id: string;
  rpc: string;
  explorer: string;
}

const int = (raw: string | undefined, fallback: number): number => {
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const pick = (raw: string | undefined, fallback: string): string => (raw ? raw.replace(/\/$/, "") : fallback);

/*
 * Note: these MUST be static member accesses on process.env so Next.js inlines
 * the NEXT_PUBLIC_* values into client bundles at build time. Dynamic keys
 * (e.g. `process.env[prefix + "_ID"]`) are not inlined and would silently
 * fall back to defaults in the browser.
 */
export const CHAIN_SPEC: Record<ChainName, ChainEnvSpec> = {
  mainnet: {
    name: "mainnet",
    id: int(process.env.NEXT_PUBLIC_CHAIN_MAINNET_ID, 5042).toString(),
    rpc: pick(process.env.NEXT_PUBLIC_CHAIN_MAINNET_RPC, "https://rpc.mainnet.arc.io"),
    explorer: pick(process.env.NEXT_PUBLIC_CHAIN_MAINNET_EXPLORER, "https://explorer.arc.io"),
  },
  testnet: {
    name: "testnet",
    id: int(process.env.NEXT_PUBLIC_CHAIN_TESTNET_ID, 5042002).toString(),
    rpc: pick(process.env.NEXT_PUBLIC_CHAIN_TESTNET_RPC, "https://rpc.testnet.arc.io"),
    explorer: pick(process.env.NEXT_PUBLIC_CHAIN_TESTNET_EXPLORER, "https://explorer.testnet.arc.io"),
  },
};

export const TOKEN_SPEC: Record<ChainName, Record<TokenName, TokenMeta>> = {
  mainnet: mainnetTokens,
  testnet: testnetTokens,
};

export function tokensFor(chain: ChainName): TokenMeta[] {
  return (Object.keys(TOKEN_SPEC[chain]) as TokenName[]).map((k) => TOKEN_SPEC[chain][k]);
}

export function tokenFor(chain: ChainName, token: TokenName): TokenMeta {
  return TOKEN_SPEC[chain][token];
}

const arcChain = (spec: ChainEnvSpec): Chain =>
  defineChain({
    id: Number(spec.id),
    name: spec.name === "mainnet" ? "Arc Mainnet" : "Arc Testnet",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: NATIVE_USDC_DECIMALS },
    rpcUrls: { default: { http: [spec.rpc] } },
    blockExplorers: { default: { name: "Arc Explorer", url: spec.explorer } },
    testnet: spec.name === "testnet",
  });

export const arcMainnet: Chain = arcChain(CHAIN_SPEC.mainnet);
export const arcTestnet: Chain = arcChain(CHAIN_SPEC.testnet);

export const chainsByName: Record<ChainName, Chain> = {
  mainnet: arcMainnet,
  testnet: arcTestnet,
};

export function nameOfChainId(chainId: number | undefined): ChainName | null {
  for (const name of ["mainnet", "testnet"] as const) {
    if (Number(CHAIN_SPEC[name].id) === chainId) return name;
  }
  return null;
}

export function defaultChainName(): ChainName {
  const v = process.env.NEXT_PUBLIC_PAYRAIL_DEFAULT_CHAIN;
  return v === "mainnet" || v === "testnet" ? v : "testnet";
}

export function explorerTxUrl(name: ChainName, txHash: string): string {
  return `${CHAIN_SPEC[name].explorer}/tx/${txHash}`;
}