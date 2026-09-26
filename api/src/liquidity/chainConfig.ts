import {
  USDC_NATIVE_DECIMALS,
  type ChainConfig,
  type ChainKey,
  type TokenInfo,
  type TokenKey,
} from "./types.js";

/**
 * Single source of truth for chains and tokens.
 * Only addresses/decimals verified in /docs/RECON.md are included.
 *
 * Verification status:
 *  - mainnet tokens: confirmed on-chain via eth_call (decimals/symbol) 2026-09-24.
 *  - testnet non-USDC tokens: taken from docs.arc.io contract-addresses only (marked verified:false).
 *  - Uniswap v4 mainnet addresses: code presence confirmed on-chain; testnet NOT confirmed.
 */

export const CHAIN_KEYS: ChainKey[] = ["mainnet", "testnet", "basesepolia", "base"];

export const TOKEN_KEYS: TokenKey[] = ["USDC", "EURC", "cirBTC", "WETH"];

export const USDC_NATIVE_ADDRESS: `0x${string}` =
  "0x3600000000000000000000000000000000000000";

const mainnetTokens: Record<TokenKey, TokenInfo> = {
  USDC: {
    key: "USDC",
    address: USDC_NATIVE_ADDRESS,
    decimals: 6,
    verified: true,
  },
  EURC: {
    key: "EURC",
    address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    decimals: 6,
    verified: true,
  },
  cirBTC: {
    key: "cirBTC",
    address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
    decimals: 8,
    verified: true,
  },
  WETH: {
    key: "WETH",
    address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB",
    decimals: 18,
    verified: true,
  },
};

const testnetTokens: Record<TokenKey, TokenInfo> = {
  USDC: {
    key: "USDC",
    address: USDC_NATIVE_ADDRESS,
    decimals: 6,
    verified: true,
  },
  EURC: {
    key: "EURC",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
    verified: false,
  },
  cirBTC: {
    key: "cirBTC",
    address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
    decimals: 8,
    verified: false,
  },
  WETH: {
    key: "WETH",
    address: "0x2c4047028a72803939b6fb674D01bC059B5C4961",
    decimals: 18,
    verified: false,
  },
};

const basesepoliaTokens: Partial<Record<TokenKey, TokenInfo>> = {
  USDC: {
    key: "USDC",
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6,
    verified: true,
  },
  WETH: {
    key: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    verified: true,
  },
};

const baseTokens: Partial<Record<TokenKey, TokenInfo>> = {
  USDC: {
    key: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    verified: true,
  },
  WETH: {
    key: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    verified: true,
  },
};

export const CHAIN_CONFIG: Record<ChainKey, ChainConfig> = {
  mainnet: {
    key: "mainnet",
    chainId: 5042,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
    minGasGwei: 20,
    gasToken: { symbol: "USDC", decimals: USDC_NATIVE_DECIMALS, address: USDC_NATIVE_ADDRESS },
    tokens: mainnetTokens,
    uniswap: {
      poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
      universalRouter: "0x8702463e73f74d0b6765aBceb314Ef07aCb92650",
      quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
  },
  testnet: {
    key: "testnet",
    chainId: 5042002,
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
    faucetUrl: "https://faucet.circle.com",
    minGasGwei: 20,
    gasToken: { symbol: "USDC", decimals: USDC_NATIVE_DECIMALS, address: USDC_NATIVE_ADDRESS },
    tokens: testnetTokens,
  },
  basesepolia: {
    key: "basesepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    faucetUrl: "https://www.base.org/faucets",
    minGasGwei: 0.05,
    gasToken: { symbol: "ETH", decimals: 18, address: null },
    tokens: basesepoliaTokens,
  },
  base: {
    key: "base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    minGasGwei: 1,
    gasToken: { symbol: "ETH", decimals: 18, address: null },
    tokens: baseTokens,
  },
};

/** Helpers used by sources so they never hardcode decimals. */
export function getToken(chain: ChainKey, key: TokenKey): TokenInfo {
  const token = CHAIN_CONFIG[chain].tokens[key];
  if (!token) throw new Error(`Unknown token ${key} on ${chain}`);
  return token;
}

export function getChain(chain: ChainKey): ChainConfig {
  return CHAIN_CONFIG[chain];
}

export { USDC_NATIVE_DECIMALS };