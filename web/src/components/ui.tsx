"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-accent text-accentink hover:opacity-90",
    secondary: "border border-line bg-surface text-ink hover:border-linestrong",
    ghost: "text-muted hover:bg-surface2 hover:text-ink",
    danger: "bg-danger text-white hover:opacity-90",
  } as const;
  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-sm",
    lg: "h-11 px-5 text-[15px]",
  } as const;
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "accent" | "amber" | "danger" | "mint";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: "border-line bg-surface2 text-muted",
    accent: "border-accent/30 bg-accentsoft text-accent",
    mint: "border-mint/40 bg-accentsoft text-accent",
    amber: "border-amber bg-ambersoft text-amber",
    danger: "border-danger bg-dangersoft text-danger",
  } as const;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("card p-5", className)}>{children}</section>;
}

export function CardTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {aside}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton-pulse rounded-md bg-surface2", className)} aria-hidden="true" />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="grid size-10 place-items-center rounded-full border border-line bg-surface2 text-faint" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v8m0 0v4m0-4h4m-4 0H8m12 8H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label ?? `Copy ${value}`}
      title="Copy"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          },
          () => undefined,
        );
      }}
      className={cx(
        "inline-flex h-7 items-center gap-1 rounded-md border px-1.5 font-mono text-[11px] transition-colors",
        copied ? "border-mint/40 text-accent" : "border-line bg-surface text-faint hover:text-ink",
      )}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m4 12.5 5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
      {copied ? "Copied" : ""}
    </button>
  );
}