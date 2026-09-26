import { z } from "zod";
import { getChain } from "@payrail/api/liquidity";
import type { McpConfigParsed } from "../config.js";
import { tokensForChain } from "../format.js";
import { okResult, type ToolResult } from "./result.js";

export const argsSchema = z.object({});

export type ListSupportedTokensArgs = z.output<typeof argsSchema>;

export function listSupportedTokensDescription(): string {
  return [
    "List the tokens the Payrail API can quote and pay out on the configured chain, with addresses and decimals.",
    "USDC is special on Arc: it is the native gas/payment token with 18 decimals at the ERC-20 view",
    "(same balance as the native 18-decimal representation). All token amounts in other tools must use the decimals listed here.",
  ].join("\n");
}

export async function listSupportedTokensHandler(
  config: McpConfigParsed,
): Promise<ToolResult> {
  const chain = getChain(config.chain);
  const tokens = tokensForChain(config.chain).map((t) => ({
    key: t.key,
    address: t.address,
    decimals: t.decimals,
    verified: t.verified,
  }));

  return okResult({
    chain: config.chain,
    chainId: chain.chainId,
    rpcUrl: chain.rpcUrl,
    explorerUrl: chain.explorerUrl,
    minGasGwei: chain.minGasGwei,
    gasNote: "Native gas token is USDC (18 decimals); USDC ERC-20 view shares the same balance (6 decimals view).",
    tokens,
  });
}