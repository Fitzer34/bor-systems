/**
 * Multi-site rollup endpoint — enterprise customer dashboard.
 *
 * A cleaning company with 20 client buildings doesn't want 20 separate
 * dashboards. They want ONE screen showing all sites, sorted by who
 * has the most alerts right now. This endpoint powers that view.
 *
 * Note: BOR's tenancy model is `organisations`. For a multi-property
 * cleaning company, each customer building is modelled as a `buildings`
 * row under the cleaning company's org. The view here aggregates over
 * those buildings.
 */

import type { FastifyInstance } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };

export default async function sitesRoutes(app: FastifyInstance): Promise<void> {
  // ─── Per-building rollup ─────────────────────────────────────────────
  //
  // Returns one row per building with:
  //   - id, name
  //   - hanger count
  //   - open alert count
  //   - 30-day spill count
  //   - 30-day avg response time
  //   - online hanger count (seen in last 5 minutes)
  //   - low-battery hanger count
  //
  // Sorted by open alerts desc so the screen leads with sites that
  // need attention right now.
  app.get(
    "/sites/summary",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req) => {
      const c = ctx(req);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const fiveMinAgo   = new Date(Date.now() - 5 * 60 * 1000);

      const rows = await db.execute<{
        building_id: string;
        building_name: string;
        hanger_count: number;
        online_count: number;
        low_battery_count: number;
        open_alerts: number;
        thirty_day_spills: number;
        avg_response_seconds: number | null;
      }>(sql`
        SELECT
          b.id   AS building_id,
          b.name AS building_name,
          COUNT(DISTINCT h.id)::int AS hanger_count,
          COUNT(DISTINCT h.id) FILTER (
            WHERE h.last_seen_at >= ${fiveMinAgo}
              AND h.status = 'active'
          )::int AS online_count,
          COUNT(DISTINCT h.id) FILTER (
            WHERE h.battery_pct IS NOT NULL AND h.battery_pct <= 20
          )::int AS low_battery_count,
          COUNT(DISTINCT a_open.id)::int AS open_alerts,
          COUNT(DISTINCT a_recent.id)::int AS thirty_day_spills,
          AVG(EXTRACT(EPOCH FROM (a_recent.acknowledged_at - a_recent.opened_at)))::float8 AS avg_response_seconds
        FROM buildings b
        LEFT JOIN floors  f ON f.building_id = b.id
        LEFT JOIN zones   z ON z.floor_id    = f.id
        LEFT JOIN hangers h ON h.zone_id     = z.id AND h.organisation_id = b.organisation_id
        LEFT JOIN alerts a_open ON a_open.hanger_id = h.id
          AND a_open.closed_at IS NULL
          AND a_open.kind = 'spill'
        LEFT JOIN alerts a_recent ON a_recent.hanger_id = h.id
          AND a_recent.opened_at >= ${thirtyDaysAgo}
          AND a_recent.kind = 'spill'
          AND a_recent.acknowledged_at IS NOT NULL
        WHERE b.organisation_id = ${c.orgId}
        GROUP BY b.id, b.name
        ORDER BY open_alerts DESC, thirty_day_spills DESC, b.name
      `);

      return {
        sites: rows.map((r) => ({
          buildingId:        r.building_id,
          buildingName:      r.building_name,
          hangerCount:       Number(r.hanger_count) || 0,
          onlineCount:       Number(r.online_count) || 0,
          lowBatteryCount:   Number(r.low_battery_count) || 0,
          openAlerts:        Number(r.open_alerts) || 0,
          thirtyDaySpills:   Number(r.thirty_day_spills) || 0,
          avgResponseSeconds: r.avg_response_seconds ? Math.round(Number(r.avg_response_seconds)) : null,
        })),
      };
    },
  );
}
