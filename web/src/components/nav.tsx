"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";
import { cx } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/payout", label: "New payout" },
  { href: "/plans", label: "Plans" },
  { href: "/keys", label: "Policy & keys" },
  { href: "/agent", label: "Agent" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Payrail home">
      <span className="grid size-7 place-items-center rounded-md bg-accent text-accentink" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M4 12.5 10 6.5 14 10.5 20 4.5M4 17.5 10 11.5 14 15.5 20 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight">Payrail</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();

  const links = LINKS.map((link) => {
    const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          active ? "bg-surface2 text-ink" : "text-muted hover:bg-surface2 hover:text-ink",
        )}
      >
        {link.label}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
          {links}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
      <nav aria-label="Primary (mobile)" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
        {links}
      </nav>
    </header>
  );
}