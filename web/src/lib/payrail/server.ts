import "server-only";
import type { PayrailProvider } from "./server/provider";
import { HttpProvider } from "./server/http";
import { MockProvider } from "./server/mock";

let provider: PayrailProvider | null = null;

/** Server-only. Returns the configured provider (mock by default). */
export function getProvider(): PayrailProvider {
  if (provider) return provider;
  const mode = process.env.PAYRAIL_MODE ?? "mock";
  provider = mode === "api" ? new HttpProvider() : new MockProvider();
  return provider;
}

export type { PayrailProvider } from "./server/provider";