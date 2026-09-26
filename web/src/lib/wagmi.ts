"use client";

import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { braveWallet, coinbaseWallet, injectedWallet, metaMaskWallet, rabbyWallet } from "@rainbow-me/rainbowkit/wallets";
import { arcMainnet, arcTestnet, baseSepolia } from "@/lib/registry";

/**
 * wagmi is configured from env values (see .env.example) through the registry —
 * never hardcoded in this file. RPC endpoints and chain ids are public info;
 * no secret appears here or in the client bundle.
 */

// RainbowKit v2 requires a WalletConnect Cloud projectId to boot. The wallets
// below are all injected (MetaMask, Rabby, Brave, Coinbase) and never open a
// WalletConnect session, so the placeholder is safe; replace it if you add
// walletConnectWallet or another WC-backed wallet later.
const projectId = "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "Payrail",
  projectId,
  chains: [arcMainnet, arcTestnet, baseSepolia],
  ssr: true,
  transports: {
    [arcMainnet.id]: http(arcMainnet.rpcUrls.default.http[0], { batch: true }),
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0], { batch: true }),
    [baseSepolia.id]: http(baseSepolia.rpcUrls.default.http[0], { batch: true }),
  },
  wallets: [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, rabbyWallet, braveWallet, coinbaseWallet, injectedWallet],
    },
  ],
});

// hydrated-style cookie persistence is intentionally avoided; connection lives
// in localStorage only (guarded by a mounted flag to prevent hydration diffs).