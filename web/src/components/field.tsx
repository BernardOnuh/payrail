"use client";

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useId } from "react";
import { cx } from "@/lib/format";

const inputBase =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors hover:border-linestrong focus:border-linestrong disabled:cursor-not-allowed disabled:opacity-50";

const errorRing = "border-danger";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[12px] font-medium tracking-wide text-muted">
        {label}
        {required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-[12px] text-danger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
            <path d="M12 8v4.5M12 15.5v.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ invalid, className, ...props }, ref) {
    return <input ref={ref} {...props} className={cx(inputBase, invalid && errorRing, className)} aria-invalid={invalid || undefined} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ invalid, className, ...props }, ref) {
    return <textarea ref={ref} {...props} className={cx(inputBase, invalid && errorRing, "min-h-24 resize-y", className)} aria-invalid={invalid || undefined} />;
  },
);

export function Select({ invalid, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} className={cx(inputBase, invalid && errorRing, className)} aria-invalid={invalid || undefined} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  const generated = useId();
  const toggleId = id ?? generated;
  return (
    <button
      type="button"
      role="switch"
      id={toggleId}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-accent bg-accent" : "border-linestrong bg-surface3",
      )}
    >
      <span
        className={cx(
          "inline-block size-3.5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}