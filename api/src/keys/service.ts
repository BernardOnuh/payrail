/**
 * API-key authentication + policy evaluation.
 */

import { policyViolation, unauthorized } from "../errors.js";
import type { ApiKeyPolicy, ApiKeyView } from "../http/schemas/keys.js";
import { sha256Hex, type KeyStore } from "./store.js";
import type { ChainKey, TokenKey } from "../liquidity/types.js";

export interface AuthContext {
  record: { id: string; name: string; policy: ApiKeyPolicy };
}

export class KeyService {
  constructor(private readonly store: KeyStore) {}

  authenticate(rawKey: string | undefined): AuthContext {
    if (!rawKey || rawKey.length < 20) throw unauthorized();
    const record = this.store.findByHash(sha256Hex(rawKey));
    if (!record || record.revokedAt != null) throw unauthorized();
    return { record: { id: record.id, name: record.name, policy: this.store.parsePolicy(record.policyJson) } };
  }

  /** Enforce the token allowlist; throws POLICY_VIOLATION. */
  assertTokensAllowed(policy: ApiKeyPolicy, tokens: TokenKey[]): void {
    for (const t of tokens) {
      if (!policy.allowedTokens.includes(t)) {
        throw policyViolation(`token ${t} is not in this key's allowlist`, {
          token: t,
          allowed: policy.allowedTokens,
        });
      }
    }
  }

  /** Enforce the per-request USD cap (USDC base units, 6-dec). */
  assertUnderCap(policy: ApiKeyPolicy, usdcTotal: bigint): void {
    if (usdcTotal > policy.maxTotalPerRequest) {
      throw policyViolation("request exceeds the key's per-request spend cap", {
        totalUsdc: usdcTotal.toString(),
        capUsdc: policy.maxTotalPerRequest.toString(),
      });
    }
  }

  chainFor(chain: ChainKey | undefined): ChainKey {
    return chain ?? "mainnet";
  }

  /* ------------------------------------------------------------------ */
  /* Key management (operator-gated at the HTTP layer)                   */
  /* ------------------------------------------------------------------ */

  listKeys(): ApiKeyView[] {
    return this.store.listKeys();
  }

  createKey(policy: ApiKeyPolicy): { id: string; raw: string; view: ApiKeyView } {
    return this.store.createKey(policy.name, policy);
  }

  /** True if a key with this id exists and was revoked by this call. */
  revokeKey(id: string): boolean {
    const view = this.store.getById(id);
    if (!view || view.revokedAt != null) return false;
    this.store.revokeById(id);
    return true;
  }

  /** Register a pre-existing credential under an operator policy. */
  registerOperator(rawKey: string, policy: ApiKeyPolicy): ApiKeyView {
    return this.store.register("operator", policy, rawKey);
  }
}