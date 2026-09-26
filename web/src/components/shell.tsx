import { Nav } from "./nav";
import { MainnetBanner } from "./mainnet-banner";
import { Aura } from "./aura";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Aura />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <MainnetBanner />
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6" id="main">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              Payrail · non-custodial stablecoin payouts for AI agents on{" "}
              <a href="https://docs.arc.io" className="underline decoration-line underline-offset-2 hover:text-ink">
                Arc
              </a>
              .
            </p>
            <p className="font-mono">USDC native gas · deterministic finality</p>
          </div>
        </footer>
      </div>
    </div>
  );
}