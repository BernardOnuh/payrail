/**
 * Chain + token registry for the web app.
 *
 * Everything public (no secrets). The wagmi chains are built from env values
 * (see .env.example) so the app is never hardcoded to a single network.
 * Token addresses/decimals mirror the verified values in
 * api/src/liquidity/chainConfig.ts (recon: on-chain verified mainnet, docs-only
 * testnet for non-USDC tokens). Base Sepolia carries only its canonical tokens.
 */
import { defineChain, type Chain } from "viem";

export type ChainName = "mainnet" | "testnet" | "basesepolia" | "base";
export type TokenName = "USDC" | "EURC" | "cirBTC" | "WETH";

export const NATIVE_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const NATIVE_USDC_DECIMALS = 18;
export const ERC20_VIEW_DECIMALS = 6;
export const MIN_GAS_GWEI = 20;

export interface ChainLabel {
  /** Block-explorer + wallet-facing display name. */
  display: string;
  /** Gas currency the wallet must hold (USDC native on Arc, ETH on Base). */
  gasSymbol: string;
  gasDecimals: number;
  /** Max fee per gas used when signing (Arc requires ~20 gwei; Base far less). */
  minGasGwei: number;
  ammCore: string;
}

export const CHAIN_LABEL: Record<ChainName, ChainLabel> = {
  mainnet: { display: "Arc Mainnet", gasSymbol: "USDC", gasDecimals: NATIVE_USDC_DECIMALS, minGasGwei: 1, ammCore: "router" },
  testnet: { display: "Arc Testnet", gasSymbol: "USDC", gasDecimals: NATIVE_USDC_DECIMALS, minGasGwei: 20, ammCore: "router" },
  basesepolia: { display: "Base Sepolia", gasSymbol: "ETH", gasDecimals: 18, minGasGwei: 1, ammCore: "router" },
  base: { display: "Base", gasSymbol: "ETH", gasDecimals: 18, minGasGwei: 1, ammCore: "router" },
};

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

const basesepoliaTokens: Partial<Record<TokenName, TokenMeta>> = {
  USDC: { key: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6, note: "verified" },
  WETH: { key: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, note: "verified" },
};

const baseTokens: Partial<Record<TokenName, TokenMeta>> = {
  USDC: { key: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, note: "verified" },
  WETH: { key: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, note: "verified" },
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
  basesepolia: {
    name: "basesepolia",
    id: int(process.env.NEXT_PUBLIC_CHAIN_BASESEPOLIA_ID, 84532).toString(),
    rpc: pick(process.env.NEXT_PUBLIC_CHAIN_BASESEPOLIA_RPC, "https://sepolia.base.org"),
    explorer: pick(process.env.NEXT_PUBLIC_CHAIN_BASESEPOLIA_EXPLORER, "https://sepolia.basescan.org"),
  },
  base: {
    name: "base",
    id: int(process.env.NEXT_PUBLIC_CHAIN_BASE_ID, 8453).toString(),
    rpc: pick(process.env.NEXT_PUBLIC_CHAIN_BASE_RPC, "https://mainnet.base.org"),
    explorer: pick(process.env.NEXT_PUBLIC_CHAIN_BASE_EXPLORER, "https://basescan.org"),
  },
};

export const TOKEN_SPEC: Record<ChainName, Partial<Record<TokenName, TokenMeta>>> = {
  mainnet: mainnetTokens,
  testnet: testnetTokens,
  basesepolia: basesepoliaTokens,
  base: baseTokens,
};

export function tokensFor(chain: ChainName): TokenMeta[] {
  return (Object.keys(TOKEN_SPEC[chain]) as TokenName[]).map((k) => TOKEN_SPEC[chain][k]!);
}

export function tokenFor(chain: ChainName, token: TokenName): TokenMeta {
  const t = TOKEN_SPEC[chain][token];
  if (!t) throw new Error(`Unknown token ${token} on chain ${chain}`);
  return t;
}

interface ChainBuildArgs {
  display: string;
  nativeName: string;
  nativeSymbol: string;
  nativeDecimals: number;
  explorerName: string;
  testnet: boolean;
}

const buildChain = (spec: ChainEnvSpec, a: ChainBuildArgs): Chain =>
  defineChain({
    id: Number(spec.id),
    name: a.display,
    nativeCurrency: { name: a.nativeName, symbol: a.nativeSymbol, decimals: a.nativeDecimals },
    rpcUrls: { default: { http: [spec.rpc] } },
    blockExplorers: { default: { name: a.explorerName, url: spec.explorer } },
    testnet: a.testnet,
  });

export const arcMainnet: Chain = buildChain(CHAIN_SPEC.mainnet, {
  display: "Arc Mainnet",
  nativeName: "USD Coin",
  nativeSymbol: "USDC",
  nativeDecimals: NATIVE_USDC_DECIMALS,
  explorerName: "Arc Explorer",
  testnet: false,
});

export const arcTestnet: Chain = buildChain(CHAIN_SPEC.testnet, {
  display: "Arc Testnet",
  nativeName: "USD Coin",
  nativeSymbol: "USDC",
  nativeDecimals: NATIVE_USDC_DECIMALS,
  explorerName: "Arc Explorer",
  testnet: true,
});

export const baseSepolia: Chain = buildChain(CHAIN_SPEC.basesepolia, {
  display: "Base Sepolia",
  nativeName: "Ether",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  explorerName: "BaseScan Sepolia",
  testnet: true,
});

export const baseMainnet: Chain = buildChain(CHAIN_SPEC.base, {
  display: "Base",
  nativeName: "Ether",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  explorerName: "BaseScan",
  testnet: false,
});

export const chainsByName: Record<ChainName, Chain> = {
  mainnet: arcMainnet,
  testnet: arcTestnet,
  basesepolia: baseSepolia,
  base: baseMainnet,
};

export function nameOfChainId(chainId: number | undefined): ChainName | null {
  if (chainId == null) return null;
  for (const name of Object.keys(CHAIN_SPEC) as ChainName[]) {
    if (Number(CHAIN_SPEC[name].id) === chainId) return name;
  }
  return null;
}

export function defaultChainName(): ChainName {
  const v = process.env.NEXT_PUBLIC_PAYRAIL_DEFAULT_CHAIN;
  return v === "mainnet" || v === "testnet" || v === "basesepolia" || v === "base" ? v : "testnet";
}

export function chainDisplayName(name: ChainName): string {
  return CHAIN_LABEL[name].display;
}

export function explorerTxUrl(name: ChainName, txHash: string): string {
  return `${CHAIN_SPEC[name].explorer}/tx/${txHash}`;
}

export type GasTokenMeta = { symbol: string; decimals: number };

export function gasTokenFor(chain: ChainName): GasTokenMeta {
  return { symbol: CHAIN_LABEL[chain].gasSymbol, decimals: CHAIN_LABEL[chain].gasDecimals };
}