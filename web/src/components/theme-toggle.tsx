"use client";

import { useTheme } from "next-themes";
import { useMounted } from "@/lib/client/hooks";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="group inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-linestrong hover:text-ink"
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="transition-transform duration-300 group-hover:rotate-90">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
          <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M12 2.2v2.3M12 19.5v2.3M2.2 12h2.3M19.5 12h2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="transition-transform duration-300 group-hover:-rotate-12">
          <path d="M19.9 14.2A8.2 8.2 0 1 1 9.8 4.1a6.6 6.6 0 1 0 10.1 10.1Z" fill="currentColor" />
          <path d="M14.5 3.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}