import type { TokenName } from "./payrail/types";

/** Parse a base-unit amount to bigint (safe against garbage input). */
export function toBigInt(s: string | bigint): bigint {
  if (typeof s === "bigint") return s;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

/**
 * Human amount from base units, e.g. 1000000 @ 6 → "1.0", 0x-native USDC gas
 * 2000000000000000 @ 18 → "0.002". Trims and keeps at most `maxFrac`.
 */
export function humanAmount(amount: string | bigint, decimals: number, maxFrac = 6): string {
  const base = toBigInt(amount);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  const sign = neg ? "-" : "";
  if (frac === 0n) return `${sign}${whole}`;
  const digits = frac.toString().padStart(decimals, "0");
  const trimmed = digits.replace(/0+$/, "");
  const shown = trimmed.length > maxFrac ? trimmed.slice(0, maxFrac) : trimmed;
  return `${sign}${whole}.${shown}`;
}

/** humanAmount + token label, e.g. "12.5 EURC". */
export function humanUnits(amount: string | bigint, token: TokenName, decimals: number, maxFrac = 6): string {
  return `${humanAmount(amount, decimals, maxFrac)} ${token}`;
}

/** Native USDC (18-dec) base units → human "0.0032" (omit token for chip use). */
export function usdcNativeHuman(amount: string | bigint, maxFrac = 6): string {
  return humanAmount(amount, 18, maxFrac);
}

const pad = (n: number) => n.toString().padStart(2, "0");

/** "02:14" style countdown; returns null when expired/past. */
export function countdownLabel(ms: number): string {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad(m)}:${pad(sec)}`;
}

/** Milliseconds from now until an ISO timestamp (past → 0). */
export function msUntil(iso: string, now = Date.now()): number {
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? 0 : Math.max(0, then - now);
}

/**
 * Human decimal amount → base-unit bigint. Accepts up to `decimals` fractional
 * digits, strips thousands separators, trims trailing zeros. Throws RangeError
 * on anything else (callers surface the message as a field error).
 */
export function toBaseUnits(human: string, decimals: number): bigint {
  const text = human.trim();
  if (!text) throw new RangeError("Amount is required.");
  const cleaned = text.replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new RangeError("Amount must be a number, e.g. 12.5");
  }
  const parts = cleaned.split(".");
  const whole0 = parts[0] ?? "";
  const frac0 = parts[1] ?? "";
  const fracTrim = frac0.replace(/0+$/, "");
  if (fracTrim.length > decimals) {
    throw new RangeError(`Max ${decimals} decimal places for this token.`);
  }
  const w = whole0 === "" ? "0" : whole0;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(fracTrim.padEnd(decimals, "0"));
}

/** Truncated address for list views: "0xAbCd…1a2b". */
export function truncateAddress(address: string | null | undefined, before = 6, after = 4): string {
  if (!address) return "";
  return `${address.slice(0, before)}…${address.slice(-after)}`;
}

/** "2m ago" / "now". */
export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(then).toLocaleDateString();
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}