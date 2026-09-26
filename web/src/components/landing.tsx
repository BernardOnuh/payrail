"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCountdownUntil, useHealth, useMounted } from "@/lib/client/hooks";
import { Card } from "./ui";

const STEPS = [
  {
    n: "1",
    title: "List recipients",
    body: "Addresses, amounts and currencies — typed or pasted from a CSV.",
  },
  {
    n: "2",
    title: "Price the flows",
    body: "Every swap leg quoted against independent liquidity, bundled into one plan.",
  },
  {
    n: "3",
    title: "Inspect the plan",
    body: "Approve, swap and payout steps laid out with targets and amounts. Nothing signed yet.",
  },
  {
    n: "4",
    title: "Sign & settle",
    body: "Your wallet walks each step. Payrail tracks the hashes to final.",
  },
];

const STEP_ICONS = [
  <svg key="i1" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>,
  <svg key="i2" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M16.5 21V9M16.5 9l-3 3M16.5 9l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 3v12M7.5 15l-3-3M7.5 15l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  <svg key="i3" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>,
  <svg key="i4" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3 5 5.5V11c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V5.5L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m9 11.5 2.2 2.2L15.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
];

const FACTS = [
  {
    term: "Never custodial",
    detail: "The API returns unsigned transactions. Backend keys quote, plan and observe — signing stays with you.",
  },
  {
    term: "Deterministic finality",
    detail: "Arc settles with one receipt per plan. No reorg risk, no waiting on confirmations to stack up.",
  },
  {
    term: "Policy at the edge",
    detail: "Per-key caps, allowed tokens, max slippage and rate limits are enforced before anything is signed.",
  },
];

const PLAN_PREVIEW = [
  { label: "Approve", detail: "USDC → Router", amount: "12,500.00" },
  { label: "Swap", detail: "USDC → EURC", amount: "11,420.18" },
  { label: "Payout", detail: "3 recipients", amount: "11,420.18" },
];

/** A real, ticking quote countdown for the hero — not a static mock. Loops so the demo stays alive. */
function useDemoQuote() {
  const mounted = useMounted();
  // Lazy initializer keeps the first expiry pre-rendered; the UI only shows it
  // once mounted, so the null-on-server value never causes a hydration mismatch.
  const [expiresAt, setExpiresAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new Date(Date.now() + 90_000).toISOString(),
  );

  const { label, expired, msLeft } = useCountdownUntil(expiresAt);

  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(() => setExpiresAt(new Date(Date.now() + 90_000).toISOString()), 1100);
    return () => clearTimeout(t);
  }, [expired]);

  const TOTAL = 90_000;
  const pct = expiresAt && mounted && msLeft != null ? Math.max(0, Math.min(1, msLeft / TOTAL)) : 0;

  return { label: mounted && expiresAt ? label : "", expired, ready: mounted && Boolean(expiresAt), pct };
}

function CountdownRing({ pct, label, expired }: { pct: number; label: string; expired: boolean }) {
  const R = 15.5;
  const C = 2 * Math.PI * R;
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" aria-hidden="true">
      <svg width="46" height="46" viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          stroke={expired ? "var(--amber)" : "var(--accent)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-linear"
        />
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center font-mono text-[11px] ${
          expired ? "text-amber" : pct > 0 ? "text-ink" : "text-faint"
        }`}
      >
        {pct > 0 ? label : "—"}
      </span>
    </span>
  );
}

export function Landing() {
  const health = useHealth();
  const mounted = useMounted();
  const quote = useDemoQuote();

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section
        className={`grid gap-10 pt-8 transition-all duration-700 ease-out lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:pt-14 ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div>
          <p className="text-[13px] text-muted">Non-custodial payouts for Arc, built for agents to plan.</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
            Every payout is a plan before it&rsquo;s a transaction.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            Payrail turns a list of recipients into a reviewed, unsigned set of treasury transactions — approvals,
            swaps and batch payouts — that a wallet you control signs, one step at a time.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/payout"
              className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-medium text-accentink transition-opacity hover:opacity-90"
            >
              Start a payout
            </Link>
            <Link
              href="/agent"
              className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-5 text-[15px] font-medium text-ink transition-colors hover:border-linestrong"
            >
              Connect an agent
            </Link>
          </div>
          {health.data?.ok ? (
            <p className="mono-num mt-8 flex items-center gap-2 text-[12px] text-faint">
              <span className="size-1.5 rounded-full bg-mint" aria-hidden="true" />
              api online, {health.data.mode} mode
            </p>
          ) : null}
        </div>

        {/* Live plan preview — a real countdown from useCountdownUntil, not decoration */}
        <Card className="relative overflow-hidden">
          <span className="holo-hairline" aria-hidden="true" />

          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="holo-live">
                <span className="relative flex size-1.5" aria-hidden="true">
                  {mounted ? (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-70" />
                  ) : null}
                  <span className="relative inline-flex size-1.5 rounded-full bg-mint" />
                </span>
                Live
              </span>
              <span className="truncate font-mono text-[11px] uppercase tracking-wider text-faint">
                Payout plan · 3 steps · unsigned
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <CountdownRing pct={quote.pct} label={quote.label} expired={quote.expired} />
              <p className="font-mono text-[10px] uppercase tracking-wider text-faint">
                {quote.ready ? (quote.expired ? "requoting" : "quote expires") : "quoting…"}
              </p>
            </div>
          </div>

          <div className="relative mt-6 space-y-0">
            <span className="holo-energy" aria-hidden="true" />
            {PLAN_PREVIEW.map((step, i) => {
              const last = i === PLAN_PREVIEW.length - 1;
              return (
                <div key={step.label} className="relative mt-0.5 flex items-start gap-3 pb-5 last:pb-0">
                  <span
                    className={`relative flex size-[15px] shrink-0 items-center justify-center rounded-full border-2 bg-surface transition-transform duration-500 ease-out ${
                      last ? "border-mint" : "border-accent"
                    }`}
                    style={{ transform: mounted ? "scale(1)" : "scale(0.4)", transitionDelay: `${i * 90}ms` }}
                  >
                    <span
                      className={`size-[6px] rounded-full transition-opacity duration-500 ${
                        last ? "bg-mint" : "bg-accent"
                      }`}
                      style={{ opacity: mounted ? 1 : 0, transitionDelay: `${i * 90 + 160}ms` }}
                    />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[14px] font-medium text-ink">{step.label}</p>
                      <p className="mono-num text-[13px] text-muted">{step.amount}</p>
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mt-2 flex items-center gap-2 border-t border-line pt-3">
            <span className="h-3 w-[2px] shrink-0 bg-accent/70" aria-hidden="true" />
            <p className="text-[12px] text-faint">
              Reviewed here. Signed by your wallet.{" "}
              <span className="text-muted">Nothing moves until you approve it.</span>
            </p>
          </div>
        </Card>
      </section>

      {/* Process — a real sequence, shown as a track */}
      <section aria-label="How it works">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Four steps, zero custody.</h2>
          <p className="mt-2 text-[13.5px] text-muted">
            From a plain list to signed transactions — every price and step visible before anything moves.
          </p>
        </div>

        <div className="relative mt-12 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="group flex h-full flex-col rounded-xl border border-mint/40 bg-surface p-5 transition-[transform,box-shadow,border-color,opacity] duration-300 ease-out hover:-translate-y-1 hover:border-mint/70 hover:shadow-md hover:shadow-black/5"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "none" : "translateY(14px) scale(0.98)",
              transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 100}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 100}ms, box-shadow 0.3s ease-out, border-color 0.3s ease-out`,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface2 text-accent transition-colors duration-200 group-hover:border-accent/50">
                {STEP_ICONS[i]}
              </div>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
                Step {s.n.padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-ink">{s.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </section>

      {/* What it guarantees */}
      <section aria-label="What it guarantees">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">What it guarantees</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Safety by construction.</h2>
          <p className="mt-2 text-[13.5px] text-muted">Three properties that hold on every plan, no exceptions.</p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {FACTS.map((f, i) => (
            <div
              key={f.term}
              className="flex h-full flex-col rounded-xl border border-mint/40 bg-surface p-5 transition-[transform,box-shadow,border-color,opacity] duration-300 ease-out hover:-translate-y-1 hover:border-mint/70 hover:shadow-md hover:shadow-black/5"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "none" : "translateY(14px) scale(0.98)",
                transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 100}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 100}ms, box-shadow 0.3s ease-out, border-color 0.3s ease-out`,
              }}
            >
              <span className="grid size-6 place-items-center rounded-full border border-mint/40 bg-mint/10 text-mint">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="mt-4 text-[14.5px] font-semibold text-ink">{f.term}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-4 border-mint/40 bg-mint/5">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-accent">Put it through</p>
          <h3 className="mt-2 text-[15px] font-semibold text-ink">Try it in sixty seconds</h3>
          <p className="mt-1 text-[13px] text-muted">
            Create a key, paste a payout and sign it — the web app runs on mock data until the API is up.
          </p>
        </div>
        <Link
          href="/keys"
          className="group inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accentink transition-opacity hover:opacity-90"
        >
          Policy & keys
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </svg>
        </Link>
      </Card>
    </div>
  );
}