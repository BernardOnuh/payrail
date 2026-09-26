/**
 * SQLite-backed stores: API keys (hashed) and the request-rate limiter.
 * The raw API key is shown exactly once at creation and never persisted.
 */

import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { apiKeyPolicySchema, type ApiKeyPolicy, type ApiKeyRecord, type ApiKeyView } from "../http/schemas/keys.js";

export interface KeyStore {
  createKey(name: string, policy: ApiKeyPolicy): { id: string; raw: string; view: ApiKeyView };
  /** Register a pre-existing raw key (used to bootstrap the operator key). */
  register(name: string, policy: ApiKeyPolicy, rawKey: string): ApiKeyView;
  findByHash(hash: string): ApiKeyRecord | undefined;
  getById(id: string): ApiKeyView | undefined;
  listKeys(): ApiKeyView[];
  revokeById(id: string): void;
  /** Allowlist-safe bigint restore. */
  parsePolicy(json: string): ApiKeyPolicy;
}

const encoder = new TextEncoder();

export function sha256Hex(value: string): string {
  return createHash("sha256").update(encoder.encode(value)).digest("hex");
}

export function generateRawKey(): string {
  return `pkl_${randomBytes(24).toString("base64url")}`;
}

/** Serialize a policy for storage: bigint amounts -> decimal strings. */
export function encodePolicy(policy: ApiKeyPolicy): string {
  return JSON.stringify({
    ...policy,
    maxTotalPerRequest: policy.maxTotalPerRequest.toString(),
  });
}

const fromStorageSchema = apiKeyPolicySchema.extend({
  maxTotalPerRequest: apiKeyPolicySchema.shape.maxTotalPerRequest,
});

export function openKeyStore(path: string): KeyStore & { close(): void } {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hashed_key TEXT NOT NULL UNIQUE,
      policy_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key_hash TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key_hash, window_start)
    );
  `);

  const store: KeyStore = {
    createKey(name, policy) {
      void fromStorageSchema;
      const id = `k_${randomBytes(10).toString("base64url")}`;
      const raw = generateRawKey();
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO api_keys (id, name, hashed_key, policy_json, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      ).run(id, name, sha256Hex(raw), encodePolicy(policy), createdAt);
      return { id, raw, view: { id, name, policy, createdAt, revokedAt: null } };
    },

    register(name, policy, rawKey) {
      void fromStorageSchema;
      const id = `k_${randomBytes(10).toString("base64url")}`;
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO api_keys (id, name, hashed_key, policy_json, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(hashed_key) DO UPDATE SET revoked_at = NULL`,
      ).run(id, name, sha256Hex(rawKey), encodePolicy(policy), createdAt);
      return { id, name, policy, createdAt, revokedAt: null };
    },

    findByHash(hash) {
      const row = db
        .prepare(`SELECT id, name, hashed_key AS hashedKey, policy_json AS policyJson, created_at AS createdAt, revoked_at AS revokedAt FROM api_keys WHERE hashed_key = ?`)
        .get(hash) as ApiKeyRecord | undefined;
      return row;
    },

    getById(id) {
      const row = db
        .prepare(`SELECT id, name, hashed_key AS hashedKey, policy_json AS policyJson, created_at AS createdAt, revoked_at AS revokedAt FROM api_keys WHERE id = ?`)
        .get(id) as ApiKeyRecord | undefined;
      if (!row) return undefined;
      const policy = store.parsePolicy(row.policyJson);
      return { id: row.id, name: row.name, policy, createdAt: row.createdAt, revokedAt: row.revokedAt };
    },

    listKeys() {
      const rows = db
        .prepare(`SELECT id, name, hashed_key AS hashedKey, policy_json AS policyJson, created_at AS createdAt, revoked_at AS revokedAt FROM api_keys`)
        .all() as ApiKeyRecord[];
      return rows
        .filter((r) => r.revokedAt == null)
        .map((r) => ({ id: r.id, name: r.name, policy: store.parsePolicy(r.policyJson), createdAt: r.createdAt, revokedAt: r.revokedAt }));
    },

    revokeById(id) {
      db.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
    },

    parsePolicy(json) {
      const raw = JSON.parse(json) as { maxTotalPerRequest: string };
      return apiKeyPolicySchema.parse({
        ...raw,
        maxTotalPerRequest: raw.maxTotalPerRequest,
      }) as ApiKeyPolicy;
    },
  };

  return { ...store, close: () => db.close() };
}

/** Sliding-ish minute window rate limiter over the same database. */
export class RateLimiter {
  constructor(private readonly dbPath: string) {}

  check(keyHash: string, limit: number, nowMs = Date.now()): boolean {
    const db = new Database(this.dbPath, { readonly: false });
    try {
      const windowStart = Math.floor(nowMs / 60_000) * 60_000;
      const key = `${keyHash}:${windowStart}`;
      db.exec("CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL)");
      const row = db.prepare("SELECT count FROM rate_limits WHERE key = ?").get(key) as { count: number } | undefined;
      const current = row?.count ?? 0;
      if (current >= limit) return false;
      db.prepare(
        `INSERT INTO rate_limits (key, count) VALUES (?, 1)
         ON CONFLICT(key) DO UPDATE SET count = count + 1`,
      ).run(key);
      return true;
    } finally {
      db.close();
    }
  }
}