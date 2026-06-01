/**
 * Analytics endpoints — heat maps + trend rollups.
 *
 * The killer customer insight: "Zone N3 has 5x more spills than other zones"
 * → maybe it's a leaky vending machine, a wet entrance during rain, a faulty
 * coffee station. Helps facility managers fix root causes, not just react.
 *
 * Three endpoints:
 *   GET /analytics/zone-heatmap?days=30  → per-zone spill counts (for floor-plan overlay)
 *   GET /analytics/timeline?days=30      → daily/hourly bucket counts
 *   GET /analytics/responders?days=30    → per-cleaner response stats (leaderboard)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql, eq, and, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

// Closure note used to tag (and later remove) admin-loaded sample spills.
const SAMPLE_NOTE = "Sample data (preview)";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const requireRole =
  (allowed: Array<"admin" | "supervisor">) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };

// Cap the analytics window to the org's age so a brand-new customer gets a
// day-by-day view that grows toward 30 days, instead of a mostly-empty fixed
// 30-day window. Once the org is older than the requested window this is a
// no-op and the normal rolling window applies.
async function effectiveWindow(
  orgId: string,
  requestedDays: number,
): Promise<{ days: number; since: Date }> {
  const rows = await db.execute<{ created_at: string | Date }>(
    sql`SELECT created_at FROM organisations WHERE id = ${orgId} LIMIT 1`,
  );
  const raw = rows[0]?.created_at;
  const createdAt = raw ? new Date(raw as string) : null;
  const ageDays = createdAt
    ? Math.ceil((Date.now() - createdAt.getTime()) / 86_400_000)
    : requestedDays;
  const days = Math.max(1, Math.min(requestedDays, ageDays));
  return { days, since: new Date(Date.now() - days * 24 * 3600 * 1000) };
}

export default async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // ─── Zone heat map ─────────────────────────────────────────────────
  // Returns one row per zone with spill count + avg response time over the
  // last N days. Frontend renders this as a colour-coded overlay on the
  // floor plan — red zones = repeat-offender hotspots.
  app.get(
    "/analytics/zone-heatmap",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const q = querySchema.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const { days, since } = await effectiveWindow(c.orgId, q.data.days);

      const rows = await db.execute<{
        zone_id: string;
        zone_name: string;
        floor_id: string;
        floor_name: string;
        building_id: string;
        spill_count: number;
        avg_response_seconds: number | null;
      }>(sql`
        SELECT
          z.id   AS zone_id,
          z.name AS zone_name,
          f.id   AS floor_id,
          f.name AS floor_name,
          b.id   AS building_id,
          COUNT(a.id)::int AS spill_count,
          AVG(EXTRACT(EPOCH FROM (a.acknowledged_at - a.opened_at)))::float8 AS avg_response_seconds
        FROM zones z
        JOIN floors f    ON f.id = z.floor_id
        JOIN buildings b ON b.id = f.building_id
        LEFT JOIN hangers h ON h.zone_id = z.id
        LEFT JOIN alerts a
          ON a.hanger_id = h.id
          AND a.organisation_id = ${c.orgId}
          AND a.opened_at >= ${since}
          AND a.kind = 'spill'
        WHERE z.organisation_id = ${c.orgId}
        GROUP BY z.id, z.name, f.id, f.name, b.id
        ORDER BY spill_count DESC
      `);

      return {
        days,
        zones: rows.map((r) => ({
          zoneId:             r.zone_id,
          zoneName:           r.zone_name,
          floorId:            r.floor_id,
          floorName:          r.floor_name,
          buildingId:         r.building_id,
          spillCount:         Number(r.spill_count) || 0,
          avgResponseSeconds: r.avg_response_seconds ? Math.round(Number(r.avg_response_seconds)) : null,
        })),
      };
    },
  );

  // ─── Timeline buckets ──────────────────────────────────────────────
  // Daily spill counts over the last N days. Frontend renders as a sparkline
  // or bar chart. Reveals patterns like "Mondays are 3x busier", "rainy days
  // spike", etc.
  app.get(
    "/analytics/timeline",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const q = querySchema.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const { days, since } = await effectiveWindow(c.orgId, q.data.days);

      const rows = await db.execute<{ day: string; spill_count: number }>(sql`
        SELECT
          to_char(date_trunc('day', a.opened_at), 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS spill_count
        FROM alerts a
        WHERE a.organisation_id = ${c.orgId}
          AND a.opened_at >= ${since}
          AND a.kind = 'spill'
        GROUP BY date_trunc('day', a.opened_at)
        ORDER BY day
      `);

      return {
        days,
        buckets: rows.map((r) => ({
          day: r.day,
          spillCount: Number(r.spill_count) || 0,
        })),
      };
    },
  );

  // ─── Responder leaderboard ─────────────────────────────────────────
  // Per-cleaner stats: alerts acknowledged, average response time, alerts
  // closed. Gamification + performance management for cleaning supervisors.
  app.get(
    "/analytics/responders",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const q = querySchema.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const { days, since } = await effectiveWindow(c.orgId, q.data.days);

      const rows = await db.execute<{
        user_id: string;
        user_name: string;
        ack_count: number;
        close_count: number;
        avg_response_seconds: number | null;
      }>(sql`
        SELECT
          u.id   AS user_id,
          u.name AS user_name,
          COUNT(*) FILTER (WHERE a.acknowledged_by = u.id)::int AS ack_count,
          COUNT(*) FILTER (WHERE a.closed_by = u.id)::int       AS close_count,
          AVG(EXTRACT(EPOCH FROM (a.acknowledged_at - a.opened_at)))
            FILTER (WHERE a.acknowledged_by = u.id)::float8 AS avg_response_seconds
        FROM users u
        LEFT JOIN alerts a
          ON (a.acknowledged_by = u.id OR a.closed_by = u.id)
          AND a.organisation_id = u.organisation_id
          AND a.opened_at >= ${since}
        WHERE u.organisation_id = ${c.orgId}
          AND u.deactivated_at IS NULL
        GROUP BY u.id, u.name
        HAVING COUNT(*) FILTER (WHERE a.acknowledged_by = u.id) > 0
            OR COUNT(*) FILTER (WHERE a.closed_by      = u.id) > 0
        ORDER BY ack_count DESC, avg_response_seconds NULLS LAST
      `);

      return {
        days,
        responders: rows.map((r) => ({
          userId:             r.user_id,
          userName:           r.user_name,
          ackCount:           Number(r.ack_count) || 0,
          closeCount:         Number(r.close_count) || 0,
          avgResponseSeconds: r.avg_response_seconds ? Math.round(Number(r.avg_response_seconds)) : null,
        })),
      };
    },
  );

  // ─── Sample data (admin) ───────────────────────────────────────────
  // Populate the caller's own org with a month of sample spills so Analytics
  // and Reports render before real history exists. Clearly tagged (closureNote)
  // and fully removable via DELETE. Spread across the org's hangers and
  // attributed to its staff so the timeline, heatmap, and leaderboard all fill.
  app.post(
    "/analytics/sample-data",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const c = ctx(req);
      const hangers = await db
        .select({ id: schema.hangers.id })
        .from(schema.hangers)
        .where(and(eq(schema.hangers.organisationId, c.orgId), eq(schema.hangers.status, "active")));
      if (hangers.length === 0) {
        return reply.code(400).send({ error: "no_hangers", message: "Register at least one hanger first." });
      }
      const users = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.organisationId, c.orgId), isNull(schema.users.deactivatedAt)));

      // Backdate a young org so the age-based window shows the full 30 days.
      const [org] = await db
        .select({ createdAt: schema.organisations.createdAt })
        .from(schema.organisations)
        .where(eq(schema.organisations.id, c.orgId))
        .limit(1);
      if (org?.createdAt && Date.now() - new Date(org.createdAt).getTime() < 30 * 86_400_000) {
        await db
          .update(schema.organisations)
          .set({ createdAt: new Date(Date.now() - 90 * 86_400_000) })
          .where(eq(schema.organisations.id, c.orgId));
      }

      // Weight earlier hangers heavier so the heatmap shows repeat offenders.
      const weighted: number[] = [];
      hangers.forEach((_, idx) => {
        const w = idx === 0 ? 4 : idx === 1 ? 3 : 2;
        for (let k = 0; k < w; k++) weighted.push(idx);
      });
      const COUNT = 50;
      const rows: (typeof schema.alerts.$inferInsert)[] = [];
      for (let i = 0; i < COUNT; i++) {
        const daysAgo = i % 30;
        const hourOfDay = 7 + (i % 11);
        const opened = new Date(Date.now() - daysAgo * 86_400_000 - (24 - hourOfDay) * 3_600_000);
        const responder = users.length ? users[i % users.length] : undefined;
        const ackSecs = 30 + (i % 10) * 18;
        const closeMins = 6 + (i % 14);
        const hanger = hangers[weighted[i % weighted.length]!]!;
        rows.push({
          organisationId: c.orgId,
          hangerId: hanger.id,
          status: "closed",
          kind: "spill",
          openedAt: opened,
          acknowledgedAt: new Date(opened.getTime() + ackSecs * 1000),
          acknowledgedBy: responder?.id ?? null,
          closedAt: new Date(opened.getTime() + closeMins * 60_000),
          closedBy: responder?.id ?? null,
          closureReason: "sign_returned",
          closureNote: SAMPLE_NOTE,
        });
      }
      await db.insert(schema.alerts).values(rows);
      return { ok: true, inserted: rows.length };
    },
  );

  // Remove the sample spills this org loaded (matched by the tag note).
  app.delete(
    "/analytics/sample-data",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req) => {
      const c = ctx(req);
      await db
        .delete(schema.alerts)
        .where(and(eq(schema.alerts.organisationId, c.orgId), eq(schema.alerts.closureNote, SAMPLE_NOTE)));
      return { ok: true };
    },
  );
}
