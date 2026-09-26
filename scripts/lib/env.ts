/**
 * Shared script plumbing: .env parsing, wallets, RPC clients.
 * Chain-specific: Arc testnet (ARC_TESTNET_*) and Base Sepolia (BASE_SEPOLIA_*).
 * The scripts never import @payrail/api at the module level: they re-derive
 * the chain constants here so they run against a single commited contract ABI.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "Native USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
});

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://base-sepolia-rpc.publicnode.com"] } },
});

export const baseMainnet = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as Hex;
export const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Hex;
export const BASE_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex;
export const BASE_MAINNET_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Hex;
export const BASE_MAINNET_WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Hex;
export const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Hex;

export interface Wallet {
  address: Hex;
  privateKey: Hex;
  seedPhrase: string;
  account: ReturnType<typeof privateKeyToAccount>;
  publicClient: ReturnType<typeof makeClients>["publicClient"];
  walletClient: ReturnType<typeof makeClients>["walletClient"];
}

function makeClients(account: ReturnType<typeof privateKeyToAccount>, chain: Chain = arcTestnet) {
  const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
  const walletClient = createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) });
  return { publicClient, walletClient };
}

function buildWallet(
  chain: Chain,
  privateKey: Hex,
  seedPhrase: string,
  address: Hex,
): Wallet {
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error("configured address does not match the private key");
  }
  const { publicClient, walletClient } = makeClients(account, chain);
  return { address, privateKey, seedPhrase, account, publicClient, walletClient };
}

export function loadEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function requireWallet(): Wallet {
  const env = loadEnvFile();
  const privateKey = env.ARC_TESTNET_PRIVATE_KEY as Hex | undefined;
  const seedPhrase = env.ARC_TESTNET_SEED_PHRASE;
  const address = env.ARC_TESTNET_ADDRESS as Hex | undefined;
  if (!privateKey || !seedPhrase || !address) {
    throw new Error("scripts/.env missing ARC_TESTNET_* values");
  }
  return buildWallet(arcTestnet, privateKey, seedPhrase, address);
}

export function requireBaseWallet(): Wallet {
  const env = loadEnvFile();
  const privateKey = env.BASE_SEPOLIA_PRIVATE_KEY as Hex | undefined;
  const seedPhrase = env.BASE_SEPOLIA_SEED_PHRASE;
  const address = env.BASE_SEPOLIA_ADDRESS as Hex | undefined;
  if (!privateKey || !seedPhrase || !address) {
    throw new Error("scripts/.env missing BASE_SEPOLIA_* values");
  }
  return buildWallet(baseSepolia, privateKey, seedPhrase, address);
}

export function requireBaseMainnetWallet(): Wallet {
  const env = loadEnvFile();
  const privateKey = env.BASE_MAINNET_PRIVATE_KEY as Hex | undefined;
  const seedPhrase = env.BASE_MAINNET_SEED_PHRASE;
  const address = env.BASE_MAINNET_ADDRESS as Hex | undefined;
  if (!privateKey || !seedPhrase || !address) {
    throw new Error("scripts/.env missing BASE_MAINNET_* values (same wallet as BASE_SEPOLIA_* is fine)");
  }
  return buildWallet(baseMainnet, privateKey, seedPhrase, address);
}

export async function readNativeBalance(address: Hex): Promise<bigint> {
  const wallet = requireWallet();
  return wallet.publicClient.getBalance({ address });
}

export const erc20Abi = [
  {
    type: "function" as const,
    name: "approve" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function" as const,
    name: "balanceOf" as const,
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "allowance" as const,
    stateMutability: "view" as const,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export const routerAbi = [
  {
    type: "function" as const,
    name: "seedPool" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    outputs: [
      { name: "r0", type: "uint256" },
      { name: "r1", type: "uint256" },
    ],
  },
  {
    type: "function" as const,
    name: "swapExactIn" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "batchTransfer" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "token", type: "address" },
      {
        name: "payments",
        type: "tuple[]" as const,
        components: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "total", type: "uint256" }],
  },
  {
    type: "function" as const,
    name: "getReserves" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint256" },
      { name: "reserve1", type: "uint256" },
    ],
  },
  {
    type: "function" as const,
    name: "seeded" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function" as const,
    name: "owner" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function" as const,
    name: "feeBps" as const,
    stateMutability: "view" as const,
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export async function sendAndWait(
  wallet: Wallet,
  to: Hex,
  data: Hex,
  value = 0n,
): Promise<{ hash: Hex; gasUsed: bigint; effectiveGasPrice: bigint }> {
  const hash = await wallet.walletClient.sendTransaction({ to, data, value, account: wallet.account });
  const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });
  return { hash, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice };
}

export const BROADCASTER_POLL_MS = 2_000;