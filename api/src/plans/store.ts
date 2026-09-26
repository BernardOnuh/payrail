/**
 * Plan persistence. Each plan is stored as one JSON row keyed by planId, with
 * an updatedAt tick and replaced atomically on every state change.
 */

import Database from "better-sqlite3";
import type { PlanState } from "../http/planModel.js";

export interface PlanStore {
  save(plan: PlanState): void;
  get(id: string): PlanState | undefined;
  updateTime(id: string, updatedAt: string): void;
  /** Most recently updated plans, newest first. */
  list(limit?: number): PlanState[];
}

const BIGINT_TAG = "$bigint";
const replacer = (_k: string, v: unknown): unknown =>
  typeof v === "bigint" ? { [BIGINT_TAG]: v.toString() } : v;
const reviver = (_k: string, v: unknown): unknown =>
  v && typeof v === "object" && typeof (v as Record<string, unknown>)[BIGINT_TAG] === "string"
    ? BigInt((v as { [key: string]: string })[BIGINT_TAG] as string)
    : v;

export function openPlanStore(path = "payrail.sqlite"): PlanStore & { close(): void } {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      plan_id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const store: PlanStore = {
    save(plan) {
      db.prepare(
        `INSERT INTO plans (plan_id, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(plan_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      ).run(plan.planId, JSON.stringify(plan, replacer), plan.updatedAt);
    },
    get(id) {
      const row = db.prepare(`SELECT json FROM plans WHERE plan_id = ?`).get(id) as { json: string } | undefined;
      return row ? (JSON.parse(row.json, reviver) as PlanState) : undefined;
    },
    updateTime(id, updatedAt) {
      db.prepare(`UPDATE plans SET updated_at = ? WHERE plan_id = ?`).run(updatedAt, id);
    },
    list(limit = 50) {
      const rows = db
        .prepare(`SELECT json FROM plans ORDER BY updated_at DESC LIMIT ?`)
        .all(limit) as { json: string }[];
      return rows.map((r) => JSON.parse(r.json, reviver) as PlanState);
    },
  };

  return { ...store, close: () => db.close() };
}

/** In-memory key-value store, used for tests and single-process dev. */
export function memPlanStore(): PlanStore {
  const map = new Map<string, PlanState>();
  return {
    save(plan) {
      map.set(plan.planId, plan);
    },
    get(id) {
      return map.get(id);
    },
    updateTime(id, updatedAt) {
      const p = map.get(id);
      if (p) {
        p.updatedAt = updatedAt;
        map.set(id, p);
      }
    },
    list(limit = 50) {
      return [...map.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);
    },
  };
}