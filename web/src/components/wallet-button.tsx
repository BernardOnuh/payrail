"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useMounted } from "@/lib/client/hooks";
import { nameOfChainId } from "@/lib/registry";
import { truncateAddress } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const mounted = useMounted();

  if (!mounted) {
    return <div className="h-9 w-36 rounded-md border border-line bg-surface2" aria-hidden="true" />;
  }

  if (isConnected && address) {
    const chainName = nameOfChainId(chainId);
    const mainnet = chainName === "mainnet";
    return (
      <div className="flex items-center gap-2">
        <span
          className={`hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs sm:inline-flex ${
            mainnet ? "border-amber bg-ambersoft text-amber" : "border-line bg-surface2 text-muted"
          }`}
        >
          <span className={`size-1.5 rounded-full ${mainnet ? "bg-amber" : "bg-mint"}`} aria-hidden="true" />
          {mainnet ? "Arc mainnet" : chainName === "testnet" ? "Arc testnet" : `Chain ${chainId}`}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 font-mono text-xs text-ink transition-colors hover:border-linestrong"
          aria-label={`Disconnect ${truncateAddress(address)}`}
        >
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-mint" />
          </span>
          {truncateAddress(address)}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accentink transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}