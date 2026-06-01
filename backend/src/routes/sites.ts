/**
 * Multi-site rollup endpoint — enterprise customer dashboard.
 *
 * A cleaning company with 20 client buildings doesn't want 20 separate
 * dashboards. They want ONE screen showing all sites, sorted by who
 * has the most alerts right now. This endpoint powers that view.
 *
 * Implementation note: this used to be one big raw `db.execute(sql\`…\`)`
 * aggregation. That was the only raw-SQL endpoint in the codebase and the
 * postgres-js `db.execute` result shape made it fragile (it was returning
 * non-2xx → the dashboard showed "Could not load sites"). Rewritten to use
 * the Drizzle query builder + in-memory aggregation, matching every other
 * route. At prototype scale (a handful of buildings/hangers) the few small
 * selects + a JS rollup are plenty fast and far more robust.
 */

import type { FastifyInstance } from "fastify";
import { and, eq, gte, isNull, inArray } from "drizzle-orm";
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
  // One row per building: hanger count, online count (seen < 5 min),
  // low-battery count, open spill alerts, 30-day spills, avg response.
  // Sorted by open alerts desc so the screen leads with what needs
  // attention.
  app.get(
    "/sites/summary",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      try {
        const c = ctx(req);
        const now = Date.now();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 3600 * 1000);
        // Battery hangers deep-sleep and heartbeat hourly, so "online" must
        // tolerate a missed beat: 75 min = one hourly check-in + 15 min margin.
        // (Was 5 min, tuned for the old always-on Pi — that flagged every
        // healthy sleeping hanger as offline.)
        const onlineCutoff = new Date(now - 75 * 60 * 1000);

        // 1. Buildings in this org.
        const buildings = await db
          .select({ id: schema.buildings.id, name: schema.buildings.name })
          .from(schema.buildings)
          .where(eq(schema.buildings.organisationId, c.orgId));

        if (buildings.length === 0) return { sites: [] };

        // 2. Floors → map floorId → buildingId.
        const floors = await db
          .select({ id: schema.floors.id, buildingId: schema.floors.buildingId })
          .from(schema.floors)
          .where(eq(schema.floors.organisationId, c.orgId));
        const floorToBuilding = new Map(floors.map((f) => [f.id, f.buildingId]));

        // 3. Zones → map zoneId → buildingId (via floor).
        const zones = await db
          .select({ id: schema.zones.id, floorId: schema.zones.floorId })
          .from(schema.zones)
          .where(eq(schema.zones.organisationId, c.orgId));
        const zoneToBuilding = new Map<string, string>();
        for (const z of zones) {
          const b = floorToBuilding.get(z.floorId);
          if (b) zoneToBuilding.set(z.id, b);
        }

        // 4. Hangers in the org → map hangerId → buildingId (via zone).
        const hangers = await db
          .select({
            id: schema.hangers.id,
            zoneId: schema.hangers.zoneId,
            status: schema.hangers.status,
            batteryPct: schema.hangers.batteryPct,
            lastSeenAt: schema.hangers.lastSeenAt,
          })
          .from(schema.hangers)
          .where(eq(schema.hangers.organisationId, c.orgId));
        const hangerToBuilding = new Map<string, string>();
        for (const h of hangers) {
          const b = h.zoneId ? zoneToBuilding.get(h.zoneId) : undefined;
          if (b) hangerToBuilding.set(h.id, b);
        }

        // 5. Alerts for these hangers (spills only). One query, filtered in JS.
        const hangerIds = hangers.map((h) => h.id);
        const alerts = hangerIds.length
          ? await db
              .select({
                id: schema.alerts.id,
                hangerId: schema.alerts.hangerId,
                kind: schema.alerts.kind,
                openedAt: schema.alerts.openedAt,
                acknowledgedAt: schema.alerts.acknowledgedAt,
                closedAt: schema.alerts.closedAt,
              })
              .from(schema.alerts)
              .where(inArray(schema.alerts.hangerId, hangerIds))
          : [];

        // 6. Aggregate per building.
        type Acc = {
          hangerCount: number;
          onlineCount: number;
          lowBatteryCount: number;
          openAlerts: number;
          thirtyDaySpills: number;
          respSecSum: number;
          respSecCount: number;
        };
        const acc = new Map<string, Acc>();
        for (const b of buildings) {
          acc.set(b.id, {
            hangerCount: 0, onlineCount: 0, lowBatteryCount: 0,
            openAlerts: 0, thirtyDaySpills: 0, respSecSum: 0, respSecCount: 0,
          });
        }

        for (const h of hangers) {
          const bId = hangerToBuilding.get(h.id);
          if (!bId) continue;
          const a = acc.get(bId)!;
          a.hangerCount++;
          if (h.status === "active" && h.lastSeenAt &&
              h.lastSeenAt.getTime() >= onlineCutoff.getTime()) {
            a.onlineCount++;
          }
          if (h.batteryPct != null && h.batteryPct <= 20) a.lowBatteryCount++;
        }

        for (const al of alerts) {
          if (al.kind !== "spill") continue;
          const bId = hangerToBuilding.get(al.hangerId);
          if (!bId) continue;
          const a = acc.get(bId)!;
          if (!al.closedAt) a.openAlerts++;
          if (al.openedAt && al.openedAt.getTime() >= thirtyDaysAgo.getTime()) {
            a.thirtyDaySpills++;
            if (al.acknowledgedAt) {
              a.respSecSum += (al.acknowledgedAt.getTime() - al.openedAt.getTime()) / 1000;
              a.respSecCount++;
            }
          }
        }

        const sites = buildings
          .map((b) => {
            const a = acc.get(b.id)!;
            return {
              buildingId: b.id,
              buildingName: b.name,
              hangerCount: a.hangerCount,
              onlineCount: a.onlineCount,
              lowBatteryCount: a.lowBatteryCount,
              openAlerts: a.openAlerts,
              thirtyDaySpills: a.thirtyDaySpills,
              avgResponseSeconds: a.respSecCount > 0
                ? Math.round(a.respSecSum / a.respSecCount)
                : null,
            };
          })
          .sort((x, y) =>
            y.openAlerts - x.openAlerts ||
            y.thirtyDaySpills - x.thirtyDaySpills ||
            x.buildingName.localeCompare(y.buildingName));

        return { sites };
      } catch (err) {
        app.log.error({ err }, "sites/summary failed");
        return reply.code(500).send({ error: "sites_summary_failed" });
      }
    },
  );
}
