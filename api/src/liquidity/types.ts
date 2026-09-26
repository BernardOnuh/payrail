/**
 * Liquidity layer contracts for Payrail.
 *
 * Amounts are `bigint` in base units throughout:
 *   USDC  -> 6 decimals (ERC-20 interface at 0x3600..00)
 *   EURC  -> 6 decimals
 *   cirBTC -> 8 decimals
 *   WETH  -> 18 decimals
 *
 * Arc gas is native USDC with an 18-decimal view ("native USDC").
 * `estimatedFeeUsdc` is therefore expressed in native (18) base units.
 * See /docs/RECON.md for the two-decimal-view USDC note.
 */

export const USDC_ERC20_DECIMALS = 6;
export const USDC_NATIVE_DECIMALS = 18;

export type ChainKey = "mainnet" | "testnet";

export type TokenKey = "USDC" | "EURC" | "cirBTC" | "WETH";

export interface TokenInfo {
  /** Registry key used in requests and Quote. */
  key: TokenKey;
  /** Token contract address. */
  address: `0x${string}`;
  /** ERC-20 decimals as reported by the token contract. */
  decimals: number;
  /** Address/decimals confirmed against an authoritative source (RECON.md). */
  verified: boolean;
}

export interface UniswapV4Addresses {
  poolManager: `0x${string}`;
  universalRouter: `0x${string}`;
  quoter: `0x${string}`;
  /** Pool Manager's 0x00000..ollector-style constants live in the registry config, not logic. */
  permit2: `0x${string}`;
}

export interface ChainConfig {
  key: ChainKey;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
  /** Minimum base fee the Arc mempool requires, in gwei (20 per RECON.md). */
  minGasGwei: number;
  /** Verified token registry. Addresses are loaded from here, never inlined in logic. */
  tokens: Record<TokenKey, TokenInfo>;
  /** Uniswap v4 canonical addresses; only present where verified (mainnet). */
  uniswap?: UniswapV4Addresses;
}

export type Hex = `0x${string}`;

export interface QuoteRequest {
  chain: ChainKey;
  tokenIn: TokenKey;
  tokenOut: TokenKey;
  /** Base units of tokenIn. */
  amountIn: bigint;
  /** Max acceptable slippage in basis points (1..10_000). */
  slippageBps: number;
  /** Quote validity window in seconds. Defaults to source default (60). */
  ttlSeconds?: number;
}

export interface QuoteFee {
  type: "provider" | "gas" | "network" | "protocol";
  token: TokenKey;
  /** Base units of `token`. */
  amount: bigint;
}

/**
 * A firm quote from one source. `minAmountOut` is derived from `amountOut`
 * and the request's `slippageBps`.
 */
export interface Quote {
  source: string;
  chain: ChainKey;
  tokenIn: TokenKey;
  tokenOut: TokenKey;
  amountIn: bigint;
  amountOut: bigint;
  /** `amountOut * (10_000 - slippageBps) / 10_000`. Execution below this must be reverted. */
  minAmountOut: bigint;
  /** Total estimated fee, normalized to native USDC (18 decimal) base units. */
  estimatedFeeUsdc: bigint;
  /** Estimated fee expressed in tokenOut base units, for cross-source comparison. */
  feeInOutput: bigint;
  priceImpactBps: number;
  /** Unix seconds after which the quote should not be executed. */
  expiry: number;
  /** Itemized fees the source actually charged (best-effort). */
  fees: QuoteFee[];
  /** Source-specific payload consumed by buildSwapTx. Never trusted across sources. */
  raw: unknown;
}

export interface UnsignedApproval {
  token: TokenKey;
  tokenAddress: Hex;
  spender: Hex;
  /** BigInt amount to approve; 0n means "max uint256". */
  amount: bigint;
  tx: {
    chainId: number;
    to: Hex;
    data: Hex;
    value: bigint;
  };
}

/**
 * A transaction the CALLER signs and broadcasts. The API must never hold keys;
 * it only returns unsigned calldata. Approvals must be signed/sent before the
 * main swap tx and are listed in on-chain execution order.
 */
export interface UnsignedTx {
  chainId: number;
  to: Hex;
  data: Hex;
  value: bigint;
  approvals: UnsignedApproval[];
}

/**
 * A quote/swap source. Implementations are stateless and chain-bound via
 * config (see ChainConfig); they never hardcode addresses or decimals.
 */
export interface LiquiditySource {
  /** Stable unique name, e.g. "app-kit", "uniswap-v4". Persisted in quotes. */
  name: string;

  /** Whether this source can serve the pair on the given chain. */
  supports(chain: ChainKey, tokenIn: TokenKey, tokenOut: TokenKey): boolean;

  /** Fetch a firm quote. Rejects when the pair is unusable or liquidity is too thin. */
  getQuote(req: QuoteRequest): Promise<Quote>;

  /** Build the unsigned swap transaction for an already-obtained quote. */
  buildSwapTx(quote: Quote, recipient: Hex): Promise<UnsignedTx>;
}

export interface QuoteEngineOptions {
  /** Per-source timeout in ms. Default 5_000. */
  timeoutMs?: number;
  /** Default slippage when a request omits it. Default 50 (0.5%). */
  defaultSlippageBps?: number;
}

export interface SourceFailure {
  source: string;
  error: string;
}

export interface QuoteResult {
  /** The quote with the largest `amountOut - feeInOutput`. */
  best: Quote;
  /** All non-failed quotes from other sources, for display in the API response. */
  alternatives: Quote[];
  /** Sources that rejected or timed out, with their error messages. */
  failed: SourceFailure[];
}