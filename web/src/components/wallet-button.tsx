"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMounted } from "@/lib/client/hooks";
import { chainDisplayName, nameOfChainId } from "@/lib/registry";
import { truncateAddress } from "@/lib/format";

function Skeleton() {
  return <div className="h-9 w-36 rounded-md border border-line bg-surface2" aria-hidden="true" />;
}

export function WalletButton() {
  const mounted = useMounted();

  if (!mounted) return <Skeleton />;

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted: ready, openAccountModal, openConnectModal }) => {
        if (!ready) return <Skeleton />;

        if (account && chain) {
          const chainName = nameOfChainId(chain.id);
          const mainnet = chainName === "mainnet";
          return (
            <div className="flex items-center gap-2">
              <span
                className={`hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs sm:inline-flex ${
                  mainnet ? "border-amber bg-ambersoft text-amber" : "border-line bg-surface2 text-muted"
                }`}
              >
                <span className={`size-1.5 rounded-full ${mainnet ? "bg-amber" : "bg-mint"}`} aria-hidden="true" />
                {mainnet ? "Arc mainnet" : chainName ? chainDisplayName(chainName) : chain.name}
              </span>
              <button
                type="button"
                onClick={openAccountModal}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 font-mono text-xs text-ink transition-colors hover:border-linestrong"
                aria-label={`Wallet menu for ${truncateAddress(account.address)}`}
              >
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-mint" />
                </span>
                <span className="hidden sm:inline">{truncateAddress(account.address)}</span>
                <span className="sm:hidden">{account.displayName}</span>
              </button>
            </div>
          );
        }

        return (
          <button
            type="button"
            onClick={openConnectModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accentink transition-opacity hover:opacity-90"
          >
            <span className="hidden sm:inline">Connect wallet</span>
            <span className="sm:hidden">Connect</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}