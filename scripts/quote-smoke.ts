import { getChain, type ChainKey, type TokenKey } from "@payrail/api/liquidity";

const chain: ChainKey = "testnet";
const token: TokenKey = "USDC";

const cfg = getChain(chain);
const info = cfg.tokens[token];
console.log(
  `${chain} chainId=${cfg.chainId} ${token}=${info.address} (${info.decimals} decimals, verified=${info.verified})`,
);