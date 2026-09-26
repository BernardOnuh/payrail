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
      className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:border-linestrong hover:text-ink"
    >
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.6" />
          <path stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path fill="currentColor" d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
        </svg>
      )}
    </button>
  );
}