/**
 * Public system-status endpoint.
 *
 * Reports a rolled-up health summary suitable for an external status page
 * (UptimeRobot / StatusPage.io) and for the in-app "System status" view.
 *
 * Designed to be cheap: a single small query, ~50 ms in the worst case.
 *
 * Returns:
 *   ok: boolean
 *   service: "up" | "degraded" | "down"     // headline
 *   db: { ok: boolean, latencyMs: number }
 *   uplinks: {
 *     lastSeenAt: ISO string | null,        // most recent hanger uplink
 *     last15min: number,                    // count of uplinks in last 15 min
 *   }
 *   version: string
 *
 * Unauthenticated by design — we want monitors and customer status pages to
 * be able to hit it without credentials. No tenant data leaks; only aggregate
 * health metrics.
 */

import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export default async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", async (_req, reply) => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

    // ─── DB health probe ─────────────────────────────────────────────
    let dbOk = true;
    let dbLatencyMs = 0;
    const t0 = performance.now();
    try {
      await db.execute(sql`SELECT 1`);
    } catch (e) {
      dbOk = false;
    }
    dbLatencyMs = Math.round(performance.now() - t0);

    // ─── Recent uplink activity ──────────────────────────────────────
    // Tells us whether devices are reaching us at all — separate from DB
    // health. If devices stop phoning home but the DB is fine, that's a
    // different kind of "degraded" (probably a webhook config or LoRa issue).
    let lastSeenAt: Date | null = null;
    let last15min = 0;
    if (dbOk) {
      try {
        const [recent] = await db
          .select({
            lastSeenAt: sql<Date>`MAX(${schema.events.receivedAt})`,
            last15min: sql<number>`COUNT(*) FILTER (WHERE ${schema.events.receivedAt} >= ${fifteenMinAgo})::int`,
          })
          .from(schema.events);
        lastSeenAt = recent?.lastSeenAt ?? null;
        last15min = Number(recent?.last15min ?? 0);
      } catch {
        // Status endpoint must never crash — degrade silently.
      }
    }

    const headline =
      !dbOk          ? "down"     :
      dbLatencyMs > 500 ? "degraded" :
      "up";

    reply
      .header("cache-control", "public, max-age=10")
      .send({
        ok: dbOk,
        service: headline,
        db: { ok: dbOk, latencyMs: dbLatencyMs },
        uplinks: {
          lastSeenAt: lastSeenAt?.toISOString() ?? null,
          last15min,
        },
        version: "0.1.0",
        time: new Date().toISOString(),
      });
  });
}
