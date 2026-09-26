"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { chainsByName, chainDisplayName, nameOfChainId, type ChainName } from "@/lib/registry";
import { cx } from "@/lib/format";

const CHAIN_ORDER: ChainName[] = ["testnet", "basesepolia", "mainnet"];

function chainTag(c: ChainName): string {
  return c === "testnet" ? "safe" : c === "basesepolia" ? "safe" : "real funds";
}

export function ChainSwitcher() {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const current = chainId ? nameOfChainId(chainId) : null;

  const pick = async (target: ChainName) => {
    setOpen(false);
    if (!isConnected) return;
    try {
      await switchChainAsync({ chainId: chainsByName[target].id });
    } catch {
      /* wallet rejected; wallet chain stays where it was */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={current ? `Network: ${chainDisplayName(current)}, switch network` : "Switch network"}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs text-ink transition-colors hover:border-linestrong"
      >
        <span
          className={cx(
            "size-1.5 rounded-full",
            current === "mainnet" ? "bg-amber" : "bg-mint",
          )}
          aria-hidden="true"
        />
        {current ? chainDisplayName(current) : "Network"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close network menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-paper shadow-xl shadow-black/10">
            <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Network</p>
            <ul className="p-1">
              {CHAIN_ORDER.map((c) => {
                const active = current === c;
                return (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => void pick(c)}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                        active ? "bg-accentsoft text-accent" : "text-ink hover:bg-surface2",
                      )}
                    >
                      <span className={cx("size-1.5 shrink-0 rounded-full", c === "mainnet" ? "bg-amber" : "bg-mint")} aria-hidden="true" />
                      <span className="flex-1">{chainDisplayName(c)}</span>
                      <span className="text-[11px] text-faint">{chainTag(c)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!isConnected ? (
              <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted">
                Connect a wallet first — the switch needs a connected wallet.
              </p>
            ) : null}
            <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted">
              Base Sepolia pays gas in ETH; Arc pays gas in native USDC.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}