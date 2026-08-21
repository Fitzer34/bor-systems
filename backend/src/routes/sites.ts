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
        // Battery hangers deep-sleep and send a "still alive" check-in once a
        // DAY (spill alerts are instant + separate). So "online" must tolerate
        // a missed daily beat: 26 h = one daily check-in + 2 h margin. (A lift
        // event also refreshes lastSeenAt, so an actively-used hanger reads
        // online continuously regardless.)
        const onlineCutoff = new Date(now - 26 * 60 * 60 * 1000);

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

  /* Estate overview — one call for the "all sites" page and each site's
   * header: per-building rollups across all three disciplines plus org
   * totals. Every number is a live count from this org's records; buildings
   * with nothing attributed simply report zeros. Rows with no buildingId
   * (org-wide jobs, unplaced signs) only show up in the totals.
   */
  app.get(
    "/sites/overview",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      try {
        const c = ctx(req);
        const today = new Date().toISOString().slice(0, 10);

        const buildings = await db
          .select({ id: schema.buildings.id, name: schema.buildings.name, createdAt: schema.buildings.createdAt })
          .from(schema.buildings)
          .where(eq(schema.buildings.organisationId, c.orgId));

        type Row = {
          buildingId: string; buildingName: string;
          floors: number; floorsWithPlan: number; zones: number;
          hangers: number; hangersOnline: number; gateways: number;
          openSpills: number;
          openJobs: number; urgentJobs: number; overduePpms: number; assets: number;
          openIncidents: number; visitorsOnSite: number; staffOnClock: number;
        };
        const rows = new Map<string, Row>();
        for (const b of buildings) {
          rows.set(b.id, {
            buildingId: b.id, buildingName: b.name,
            floors: 0, floorsWithPlan: 0, zones: 0,
            hangers: 0, hangersOnline: 0, gateways: 0,
            openSpills: 0,
            openJobs: 0, urgentJobs: 0, overduePpms: 0, assets: 0,
            openIncidents: 0, visitorsOnSite: 0, staffOnClock: 0,
          });
        }
        const totals = {
          sites: buildings.length,
          openSpills: 0, openJobs: 0, urgentJobs: 0, overduePpms: 0,
          openIncidents: 0, visitorsOnSite: 0, staffOnClock: 0,
          hangers: 0, hangersOnline: 0,
        };
        const bump = (bId: string | null, f: (r: Row) => void) => {
          if (!bId) return;
          const r = rows.get(bId);
          if (r) f(r);
        };

        // Floors / zones / hangers chain (same walk as /sites/summary).
        const floors = await db
          .select({ id: schema.floors.id, buildingId: schema.floors.buildingId, floorPlanUrl: schema.floors.floorPlanUrl })
          .from(schema.floors)
          .where(eq(schema.floors.organisationId, c.orgId));
        const floorToBuilding = new Map<string, string>();
        for (const f of floors) {
          floorToBuilding.set(f.id, f.buildingId);
          bump(f.buildingId, (r) => { r.floors++; if (f.floorPlanUrl) r.floorsWithPlan++; });
        }
        const zones = await db
          .select({ id: schema.zones.id, floorId: schema.zones.floorId })
          .from(schema.zones)
          .where(eq(schema.zones.organisationId, c.orgId));
        const zoneToBuilding = new Map<string, string>();
        for (const z of zones) {
          const b = floorToBuilding.get(z.floorId) ?? null;
          if (b) zoneToBuilding.set(z.id, b);
          bump(b, (r) => { r.zones++; });
        }
        const onlineCutoff = new Date(Date.now() - 26 * 60 * 60 * 1000);
        const hangers = await db
          .select({ id: schema.hangers.id, zoneId: schema.hangers.zoneId, status: schema.hangers.status, lastSeenAt: schema.hangers.lastSeenAt })
          .from(schema.hangers)
          .where(eq(schema.hangers.organisationId, c.orgId));
        const hangerToBuilding = new Map<string, string>();
        for (const h of hangers) {
          totals.hangers++;
          const online = h.status === "active" && h.lastSeenAt && h.lastSeenAt.getTime() >= onlineCutoff.getTime();
          if (online) totals.hangersOnline++;
          const b = h.zoneId ? zoneToBuilding.get(h.zoneId) ?? null : null;
          if (b) hangerToBuilding.set(h.id, b);
          bump(b, (r) => { r.hangers++; if (online) r.hangersOnline++; });
        }
        const gateways = await db
          .select({ id: schema.gateways.id, buildingId: schema.gateways.buildingId })
          .from(schema.gateways)
          .where(eq(schema.gateways.organisationId, c.orgId));
        for (const g of gateways) bump(g.buildingId, (r) => { r.gateways++; });

        // Open spills via the hanger chain.
        const hangerIds = hangers.map((h) => h.id);
        if (hangerIds.length) {
          const alerts = await db
            .select({ hangerId: schema.alerts.hangerId, kind: schema.alerts.kind, closedAt: schema.alerts.closedAt })
            .from(schema.alerts)
            .where(and(inArray(schema.alerts.hangerId, hangerIds), isNull(schema.alerts.closedAt)));
          for (const a of alerts) {
            if (a.kind !== "spill") continue;
            totals.openSpills++;
            bump(hangerToBuilding.get(a.hangerId) ?? null, (r) => { r.openSpills++; });
          }
        }

        // Maintenance.
        const jobs = await db
          .select({ buildingId: schema.maintenanceJobs.buildingId, status: schema.maintenanceJobs.status, priority: schema.maintenanceJobs.priority })
          .from(schema.maintenanceJobs)
          .where(eq(schema.maintenanceJobs.organisationId, c.orgId));
        for (const j of jobs) {
          if (j.status === "completed" || j.status === "cancelled") continue;
          totals.openJobs++;
          const urgent = j.priority === "urgent" || j.priority === "emergency";
          if (urgent) totals.urgentJobs++;
          bump(j.buildingId, (r) => { r.openJobs++; if (urgent) r.urgentJobs++; });
        }
        const ppms = await db
          .select({ buildingId: schema.ppms.buildingId, nextDueDate: schema.ppms.nextDueDate, active: schema.ppms.active })
          .from(schema.ppms)
          .where(eq(schema.ppms.organisationId, c.orgId));
        for (const p of ppms) {
          if (p.active === false) continue;
          if (p.nextDueDate && String(p.nextDueDate) < today) {
            totals.overduePpms++;
            bump(p.buildingId, (r) => { r.overduePpms++; });
          }
        }
        const assets = await db
          .select({ buildingId: schema.assets.buildingId })
          .from(schema.assets)
          .where(eq(schema.assets.organisationId, c.orgId));
        for (const a of assets) bump(a.buildingId, (r) => { r.assets++; });

        // Security + people.
        const incidents = await db
          .select({ buildingId: schema.securityIncidents.buildingId, status: schema.securityIncidents.status })
          .from(schema.securityIncidents)
          .where(eq(schema.securityIncidents.organisationId, c.orgId));
        for (const i of incidents) {
          if (i.status === "resolved") continue;
          totals.openIncidents++;
          bump(i.buildingId, (r) => { r.openIncidents++; });
        }
        const visitors = await db
          .select({ buildingId: schema.visitors.buildingId, signedInAt: schema.visitors.signedInAt, signedOutAt: schema.visitors.signedOutAt })
          .from(schema.visitors)
          .where(eq(schema.visitors.organisationId, c.orgId));
        for (const v of visitors) {
          if (!v.signedInAt || v.signedOutAt) continue;
          totals.visitorsOnSite++;
          bump(v.buildingId, (r) => { r.visitorsOnSite++; });
        }
        const onClock = await db
          .select({ buildingId: schema.timeEntries.buildingId })
          .from(schema.timeEntries)
          .where(and(eq(schema.timeEntries.organisationId, c.orgId), isNull(schema.timeEntries.clockOutAt)));
        for (const t of onClock) {
          totals.staffOnClock++;
          bump(t.buildingId, (r) => { r.staffOnClock++; });
        }

        const sites = [...rows.values()].sort((x, y) =>
          y.openSpills - x.openSpills ||
          (y.urgentJobs + y.openIncidents) - (x.urgentJobs + x.openIncidents) ||
          x.buildingName.localeCompare(y.buildingName));
        return { sites, totals };
      } catch (err) {
        app.log.error({ err }, "sites/overview failed");
        return reply.code(500).send({ error: "sites_overview_failed" });
      }
    },
  );
}
