import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { closeAlertForHanger } from "../services/alert-flow.js";

export default async function alertRoutes(app: FastifyInstance): Promise<void> {
  app.get("/alerts/active", { preHandler: [app.authenticate] }, async () => {
    const rows = await db
      .select({
        id: schema.alerts.id,
        hangerId: schema.alerts.hangerId,
        status: schema.alerts.status,
        openedAt: schema.alerts.openedAt,
        acknowledgedAt: schema.alerts.acknowledgedAt,
        acknowledgedBy: schema.alerts.acknowledgedBy,
        zoneName: schema.zones.name,
        floorName: schema.floors.name,
      })
      .from(schema.alerts)
      .leftJoin(schema.hangers, eq(schema.hangers.id, schema.alerts.hangerId))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .where(isNull(schema.alerts.closedAt))
      .orderBy(desc(schema.alerts.openedAt));
    return { alerts: rows };
  });

  app.post("/alerts/:id/acknowledge", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = (req.user as { sub: string }).sub;

    const result = await db
      .update(schema.alerts)
      .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: userId })
      .where(and(eq(schema.alerts.id, id), eq(schema.alerts.status, "open")))
      .returning({ id: schema.alerts.id });

    if (!result[0]) return reply.code(409).send({ error: "already_acknowledged_or_closed" });
    return { ok: true };
  });

  app.post("/alerts/:id/close", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = (req.user as { sub: string }).sub;

    const body = z
      .object({
        reason: z.enum(["sign_damaged", "sign_missing", "manual"]),
        note: z.string().max(500).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });

    const [alert] = await db
      .select({ hangerId: schema.alerts.hangerId })
      .from(schema.alerts)
      .where(eq(schema.alerts.id, id))
      .limit(1);
    if (!alert) return reply.code(404).send({ error: "not_found" });

    await closeAlertForHanger(alert.hangerId, body.data.reason, userId, body.data.note);

    if (body.data.reason === "sign_damaged" || body.data.reason === "sign_missing") {
      await db
        .update(schema.hangers)
        .set({ status: "out_of_service" })
        .where(eq(schema.hangers.id, alert.hangerId));
    }
    return { ok: true };
  });
}
