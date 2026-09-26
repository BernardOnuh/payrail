"use client";

import { http, createConfig } from "wagmi";
import { arcMainnet, arcTestnet } from "@/lib/registry";

/**
 * wagmi is configured from env values (see .env.example) through the registry —
 * never hardcoded in this file. RPC endpoints and chain ids are public info;
 * no secret appears here or in the client bundle.
 */
export const wagmiConfig = createConfig({
  chains: [arcMainnet, arcTestnet],
  ssr: true,
  transports: {
    [arcMainnet.id]: http(arcMainnet.rpcUrls.default.http[0], { batch: true }),
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0], { batch: true }),
  },
});

// hydrated-style cookie persistence is intentionally avoided; connection lives
// in localStorage only (guarded by a mounted flag to prevent hydration diffs).