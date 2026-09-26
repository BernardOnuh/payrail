"use client";

import { useChainId } from "wagmi";
import { useMounted } from "@/lib/client/hooks";
import { nameOfChainId } from "@/lib/registry";

/**
 * "Real funds" banner. Shown when the connected wallet is on Arc mainnet, or
 * when `forced` is set (e.g. a plan that lives on mainnet). Anchored top so
 * it's impossible to miss before signing.
 */
export function MainnetBanner({ forced = false }: { forced?: boolean }) {
  const chainId = useChainId();
  const mounted = useMounted();

  const onMainnet = mounted && !forced && chainId != null && nameOfChainId(chainId) === "mainnet";
  if (!onMainnet && !forced) return null;

  return (
    <div className="border-b border-amber bg-ambersoft" role="region" aria-label="Mainnet warning">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-[13px] font-medium text-amber sm:px-6">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
          <path d="M12 3.5 21 20.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 10v4M12 16.6v.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span>Mainnet · real funds. Every step is final on the first receipt.</span>
      </div>
    </div>
  );
}