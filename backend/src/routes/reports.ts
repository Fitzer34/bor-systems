import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export default async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reports/spills", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const from = q.data.from ? new Date(q.data.from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = q.data.to ? new Date(q.data.to) : new Date();

    const rows = await db
      .select({
        alertId: schema.alerts.id,
        openedAt: schema.alerts.openedAt,
        acknowledgedAt: schema.alerts.acknowledgedAt,
        closedAt: schema.alerts.closedAt,
        closureReason: schema.alerts.closureReason,
        zoneName: schema.zones.name,
        floorName: schema.floors.name,
        buildingName: schema.buildings.name,
        // Cast to float8 so postgres-js returns these as JS numbers rather than
        // strings — iOS / web Codable expect Double, not String, here.
        responseSeconds: sql<number>`EXTRACT(EPOCH FROM (${schema.alerts.acknowledgedAt} - ${schema.alerts.openedAt}))::float8`,
        resolutionSeconds: sql<number>`EXTRACT(EPOCH FROM (${schema.alerts.closedAt} - ${schema.alerts.openedAt}))::float8`,
      })
      .from(schema.alerts)
      .leftJoin(schema.hangers, eq(schema.hangers.id, schema.alerts.hangerId))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.floors.buildingId))
      .where(and(
        eq(schema.alerts.organisationId, c.orgId),
        gte(schema.alerts.openedAt, from),
        lte(schema.alerts.openedAt, to),
      ))
      .orderBy(desc(schema.alerts.openedAt));

    return { from, to, count: rows.length, spills: rows };
  });

  app.get("/reports/spills.csv", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const from = q.data.from ? new Date(q.data.from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = q.data.to ? new Date(q.data.to) : new Date();

    const rows = await db
      .select({
        alertId: schema.alerts.id,
        openedAt: schema.alerts.openedAt,
        acknowledgedAt: schema.alerts.acknowledgedAt,
        closedAt: schema.alerts.closedAt,
        closureReason: schema.alerts.closureReason,
        zoneName: schema.zones.name,
        floorName: schema.floors.name,
        buildingName: schema.buildings.name,
      })
      .from(schema.alerts)
      .leftJoin(schema.hangers, eq(schema.hangers.id, schema.alerts.hangerId))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.floors.buildingId))
      .where(and(
        eq(schema.alerts.organisationId, c.orgId),
        gte(schema.alerts.openedAt, from),
        lte(schema.alerts.openedAt, to),
      ))
      .orderBy(desc(schema.alerts.openedAt));

    const header = "alert_id,opened_at,acknowledged_at,closed_at,closure_reason,building,floor,zone";
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = v instanceof Date ? v.toISOString() : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows
      .map((r) =>
        [r.alertId, r.openedAt, r.acknowledgedAt, r.closedAt, r.closureReason, r.buildingName, r.floorName, r.zoneName]
          .map(escape)
          .join(","),
      )
      .join("\n");
    reply.header("content-type", "text/csv");
    reply.header("content-disposition", `attachment; filename="spills-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`);
    return `${header}\n${body}\n`;
  });
}
