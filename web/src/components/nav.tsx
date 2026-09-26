"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";
import { ChainSwitcher } from "./chain-switcher";
import { cx } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/plans", label: "Plans" },
  { href: "/keys", label: "Policy & keys" },
  { href: "/agent", label: "Agent" },
];

function Logo() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Payrail home">
      <span className="grid size-7 place-items-center rounded-md bg-accent text-accentink transition-shadow group-hover:shadow-[0_0_0_4px_rgb(15_122_92/0.15)]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M4 12.5 10 6.5 14 10.5 20 4.5M4 17.5 10 11.5 14 15.5 20 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-[16px] font-semibold tracking-tight">Payrail</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const desktopLinks = LINKS.map((link) => {
    const active = isActive(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative px-3 py-2 text-[13.5px] transition-colors after:absolute after:inset-x-3 after:bottom-1 after:h-[2px] after:rounded-full after:bg-accent after:transition-transform after:duration-200 after:ease-out after:content-[''] hover:text-ink focus-visible:after:scale-x-100",
          active ? "text-ink after:origin-left after:scale-x-100" : "text-muted after:origin-left after:scale-x-0 hover:after:scale-x-100",
        )}
      >
        {link.label}
      </Link>
    );
  });

  // "New payout" as a clear secondary CTA on desktop, mirroring the main action.
  const cta = (
    <Link
      href="/payout"
      className={cx(
        "ml-1 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors",
        isActive("/payout")
          ? "border-accent/40 bg-accentsoft text-accent"
          : "border-line bg-surface text-ink hover:border-linestrong",
      )}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      New payout
    </Link>
  );

  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md transition-all duration-300",
        scrolled ? "shadow-md shadow-black/5" : "shadow-none",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
          {desktopLinks}
          {cta}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
          <ThemeToggle />
          <ChainSwitcher />
          <WalletButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-linestrong hover:text-ink md:hidden"
          >
            {open ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Primary (mobile)"
        inert={!open}
        className={cx(
          "absolute left-0 right-0 top-full z-40 border-t border-line bg-paper px-3 py-2 shadow-lg transition-all duration-200 md:hidden",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <ul className="flex flex-col gap-0.5">
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "block rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                    active ? "bg-accentsoft text-accent" : "text-muted hover:bg-surface2 hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
          {isActive("/payout") ? null : (
            <li>
              <Link
                href="/payout"
                onClick={() => setOpen(false)}
                className="mt-1 flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[13.5px] font-medium text-accentink"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                New payout
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}