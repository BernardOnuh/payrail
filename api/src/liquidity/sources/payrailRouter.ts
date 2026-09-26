/**
 * PayrailRouter liquidity source.
 *
 * Serves USDC <-> EURC (and other registered tokens that the router's pair
 * covers) from the self-contained x*y=k pool inside the deployed
 * PayrailRouter. Reserves are read on-chain via eth_call at quote time; output
 * math must EXACTLY mirror the contract (see poolMath.ts).
 *
 * A router is only available on a chain when PAYRAIL_ROUTER_ADDRESS_<CHAIN>
 * is configured (deployed via contracts/ scripts).
 */

import { encodeFunctionData } from "viem";
import { getToken, getChain } from "../chainConfig.js";
import { routerAddressFor } from "../../net.js";
import { payrailRouterAbi } from "../abi.js";
import {
  inputFee,
  outputForExactInput,
  priceImpactBps,
} from "../poolMath.js";
import {
  USDC_NATIVE_DECIMALS,
  type ChainConfig,
  type ChainKey,
  type Hex,
  type LiquiditySource,
  type Quote,
  type QuoteRequest,
  type UnsignedTx,
} from "../types.js";

export interface RouterReserves {
  reserve0: bigint;
  reserve1: bigint;
  seeded: boolean;
  feeBps: bigint;
}

export interface RouterDep {
  /** Read reserves; returns null when the router is not deployed/unseeded. */
  getReserves(chain: ChainKey, router: Hex): Promise<RouterReserves | null>;
}

export const routerSourceName = "payrail-router";

export function buildRouterSource(dep: RouterDep): LiquiditySource {
  const name = routerSourceName;

  function routerFor(chain: ChainKey): Hex | undefined {
    return routerAddressFor(chain);
  }

  /**
   * Amounts are denominated in token0 for the input side. The deployed
   * router only swaps token0 -> token1; on Base mainnet WETH sorts before
   * native USDC (0x4200.. < 0x8335..), so USDC is token1 and the pool would
   * sell WETH for USDC — the wrong direction for USDC-funded plans. Swaps are
   * therefore disabled on Base mainnet; USDC-only batch payouts still work.
   */
  function supports(chain: ChainKey, tokenIn: string, tokenOut: string): boolean {
    if (chain === "base") return false;
    const router = routerFor(chain);
    if (!router) return false;
    // tokenIn must be USDC (the pair's token0) for this deterministic pool.
    return tokenIn === "USDC" && tokenOut !== "USDC";
  }

  async function getQuote(req: QuoteRequest): Promise<Quote> {
    const router = routerFor(req.chain);
    if (!router) throw new Error("PayrailRouter not deployed on this chain");

    const cfg: ChainConfig = getChain(req.chain);
    if (req.tokenIn !== "USDC") {
      throw new Error("payrail-router only serves USDC as tokenIn");
    }
    const res = await dep.getReserves(req.chain, router);
    if (!res || !res.seeded || res.reserve0 === 0n || res.reserve1 === 0n) {
      throw new Error("pool not seeded");
    }

    const amountOut = outputForExactInput(res.reserve0, res.reserve1, req.amountIn, res.feeBps);
    const slippage = BigInt(req.slippageBps);
    const minAmountOut = (amountOut * (10_000n - slippage)) / 10_000n;
    const expiry = Math.floor(Date.now() / 1000) + (req.ttlSeconds ?? 60);

    const providerFeeNative =
      inputFee(req.amountIn, res.feeBps) * 10n ** BigInt(USDC_NATIVE_DECIMALS - getToken(req.chain, "USDC").decimals);

    const impact = priceImpactBps(res.reserve0, res.reserve1, req.amountIn, res.feeBps);
    void cfg;

    return {
      source: name,
      chain: req.chain,
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      amountIn: req.amountIn,
      amountOut,
      minAmountOut,
      estimatedFeeUsdc: providerFeeNative,
      feeInOutput: providerFeeNative / 10n ** BigInt(USDC_NATIVE_DECIMALS - getToken(req.chain, "USDC").decimals) / 10n,
      priceImpactBps: impact,
      expiry,
      fees: [
        {
          type: "provider",
          token: "USDC",
          amount: inputFee(req.amountIn, res.feeBps),
        },
      ],
      raw: {
        router,
        reserves: { reserve0: res.reserve0.toString(), reserve1: res.reserve1.toString() },
        feeBps: res.feeBps.toString(),
      },
    };
  }

  async function buildSwapTx(quote: Quote, recipient: Hex): Promise<UnsignedTx> {
    const router = quote.raw as { router: Hex };
    const data = encodeFunctionData({
      abi: payrailRouterAbi,
      functionName: "swapExactIn",
      args: [quote.amountIn, quote.minAmountOut, recipient],
    });
    const cfg = getChain(quote.chain);
    return {
      chainId: cfg.chainId,
      to: router.router,
      data,
      value: 0n,
      approvals: [],
    };
  }

  return { name, supports, getQuote, buildSwapTx };
}