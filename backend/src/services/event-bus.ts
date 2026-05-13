/**
 * Tiny in-process event bus for pushing live updates to SSE subscribers.
 *
 * Subscriptions are keyed by organisationId so each org only sees its own
 * events. The bus is in-process — fine for a single backend instance (which
 * is what Render runs us as on the free tier). If we ever scale to multiple
 * instances we'd swap this for Postgres LISTEN/NOTIFY or Redis pub/sub.
 */

export type LiveEvent =
  | { type: "alert.open"; alertId: string; zoneId: string | null }
  | { type: "alert.acknowledged"; alertId: string }
  | { type: "alert.closed"; alertId: string; reason: string }
  | { type: "alert.escalated"; alertId: string }
  | { type: "dispatch.created"; dispatchId: string; recipientUserId: string }
  | { type: "dispatch.acknowledged"; dispatchId: string }
  | { type: "dispatch.completed"; dispatchId: string }
  | { type: "hanger.updated"; hangerId: string };

type Subscriber = (e: LiveEvent) => void;

class EventBus {
  private subs = new Map<string, Set<Subscriber>>();

  subscribe(orgId: string, cb: Subscriber): () => void {
    let set = this.subs.get(orgId);
    if (!set) {
      set = new Set();
      this.subs.set(orgId, set);
    }
    set.add(cb);
    return () => {
      const s = this.subs.get(orgId);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.subs.delete(orgId);
    };
  }

  publish(orgId: string, event: LiveEvent): void {
    const set = this.subs.get(orgId);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(event);
      } catch {
        // ignore — the subscriber will be cleaned up when the connection closes
      }
    }
  }

  subscriberCount(orgId: string): number {
    return this.subs.get(orgId)?.size ?? 0;
  }
}

export const eventBus = new EventBus();
