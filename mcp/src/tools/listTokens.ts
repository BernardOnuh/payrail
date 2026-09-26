import { z } from "zod";
import { getChain } from "@payrail/api/liquidity";
import type { McpConfigParsed } from "../config.js";
import { tokensForChain } from "../format.js";
import { okResult, type ToolResult } from "./result.js";

export const argsSchema = z.object({});

export type ListSupportedTokensArgs = z.output<typeof argsSchema>;

export function listSupportedTokensDescription(chain: McpConfigParsed["chain"]): string {
  const gas = getChain(chain).gasToken;
  const arcSpecific =
    getChain(chain).gasToken.symbol === "USDC"
      ? " USDC is special on Arc: it is the native gas/payment token with 18 decimals at the ERC-20 view (same balance as the native 18-decimal representation)."
      : "";
  return [
    `List the tokens the Payrail API can quote and pay out on the configured chain (${chain}), with addresses and decimals.`,
    `Gas currency on ${chain} is ${gas.symbol} (${gas.decimals} decimals).`,
    "All token amounts in other tools must use the decimals listed here.",
    arcSpecific,
  ].join("\n");
}

export async function listSupportedTokensHandler(
  config: McpConfigParsed,
): Promise<ToolResult> {
  const chain = getChain(config.chain);
  const gas = chain.gasToken;
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
    gasToken: { symbol: gas.symbol, decimals: gas.decimals, address: gas.address },
    gasNote: `Native gas currency is ${gas.symbol} (${gas.decimals} decimals) on ${config.chain}.`,
    tokens,
  });
}