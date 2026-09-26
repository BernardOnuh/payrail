/**
 * In-memory SSE hub. One subscriber set per planId; events carry the same
 * shapes defined in http/schemas/plan.ts (SseEventParsed).
 */

import type { SseEventParsed } from "../http/schemas/plan.js";

export interface SseSubscriber {
  queue: SseEventParsed[];
  send: (event: SseEventParsed) => void;
}

export class SseHub {
  private readonly byPlan = new Map<string, Set<SseSubscriber>>();

  subscribe(planId: string, send: (event: SseEventParsed) => void): () => void {
    let set = this.byPlan.get(planId);
    if (!set) {
      set = new Set();
      this.byPlan.set(planId, set);
    }
    const sub: SseSubscriber = { queue: [], send };
    set.add(sub);
    return () => {
      set.delete(sub);
      if (set.size === 0) this.byPlan.delete(planId);
    };
  }

  /** Push an event to every subscriber of the plan. */
  publish(event: SseEventParsed): void {
    const set = this.byPlan.get(((event.data as { planId: string }).planId ?? "").toString());
    if (!set) return;
    for (const sub of set) sub.send(event);
  }
}