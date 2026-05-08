import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyEmail, notifyPush, notifySms } from "../services/notifications.js";
import { ctx } from "../services/auth-context.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function dispatchRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/dispatches",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z
        .object({
          recipientUserId: z.string().uuid(),
          zoneId: z.string().uuid().nullable().optional(),
          message: z.string().min(1).max(500),
          alsoSms: z.boolean().default(false),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);

      const [recipient] = await db
        .select()
        .from(schema.users)
        .where(and(
          eq(schema.users.id, body.data.recipientUserId),
          eq(schema.users.organisationId, c.orgId),
        ))
        .limit(1);
      if (!recipient || recipient.deactivatedAt) {
        return reply.code(404).send({ error: "recipient_not_found_or_deactivated" });
      }

      let zoneLabel = "";
      if (body.data.zoneId) {
        const [zone] = await db
          .select({ name: schema.zones.name, floorName: schema.floors.name })
          .from(schema.zones)
          .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
          .where(and(
            eq(schema.zones.id, body.data.zoneId),
            eq(schema.zones.organisationId, c.orgId),
          ))
          .limit(1);
        if (zone) zoneLabel = `${zone.floorName ?? ""} — ${zone.name}`.replace(/^ — /, "");
      }

      const [created] = await db
        .insert(schema.dispatches)
        .values({
          organisationId: c.orgId,
          recipientUserId: body.data.recipientUserId,
          senderUserId: c.sub,
          zoneId: body.data.zoneId ?? null,
          message: body.data.message,
        })
        .returning();

      const title = zoneLabel ? `Dispatch — ${zoneLabel}` : "Dispatch";
      const ctxN = {
        orgId: c.orgId,
        alertId: null,
        userId: body.data.recipientUserId,
        title,
        body: body.data.message,
        kind: "alert" as const,
      };
      await notifyPush(ctxN);
      if (body.data.alsoSms) await notifySms(ctxN);
      void notifyEmail;

      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "dispatch.sent",
        targetType: "dispatch",
        targetId: created!.id,
        metadata: { recipient: body.data.recipientUserId, zoneId: body.data.zoneId, alsoSms: body.data.alsoSms },
      });

      return { dispatch: created };
    },
  );

  app.get("/dispatches", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);

    const baseSelect = db
      .select({
        id: schema.dispatches.id,
        recipientUserId: schema.dispatches.recipientUserId,
        recipientName: schema.users.name,
        senderUserId: schema.dispatches.senderUserId,
        zoneId: schema.dispatches.zoneId,
        zoneName: schema.zones.name,
        floorId: schema.zones.floorId,
        message: schema.dispatches.message,
        status: schema.dispatches.status,
        sentAt: schema.dispatches.sentAt,
        acknowledgedAt: schema.dispatches.acknowledgedAt,
        completedAt: schema.dispatches.completedAt,
      })
      .from(schema.dispatches)
      .leftJoin(schema.users, eq(schema.users.id, schema.dispatches.recipientUserId))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.dispatches.zoneId))
      .where(eq(schema.dispatches.organisationId, c.orgId));

    if (c.role === "admin" || c.role === "supervisor") {
      const rows = await baseSelect.orderBy(desc(schema.dispatches.sentAt)).limit(200);
      return { dispatches: rows };
    }

    // Cleaner: only their own active ones
    const rows = await db
      .select({
        id: schema.dispatches.id,
        recipientUserId: schema.dispatches.recipientUserId,
        recipientName: schema.users.name,
        senderUserId: schema.dispatches.senderUserId,
        zoneId: schema.dispatches.zoneId,
        zoneName: schema.zones.name,
        floorId: schema.zones.floorId,
        message: schema.dispatches.message,
        status: schema.dispatches.status,
        sentAt: schema.dispatches.sentAt,
        acknowledgedAt: schema.dispatches.acknowledgedAt,
        completedAt: schema.dispatches.completedAt,
      })
      .from(schema.dispatches)
      .leftJoin(schema.users, eq(schema.users.id, schema.dispatches.recipientUserId))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.dispatches.zoneId))
      .where(and(
        eq(schema.dispatches.organisationId, c.orgId),
        eq(schema.dispatches.recipientUserId, c.sub),
        ne(schema.dispatches.status, "completed"),
      ))
      .orderBy(desc(schema.dispatches.sentAt));
    return { dispatches: rows };
  });

  app.post("/dispatches/:id/acknowledge", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const result = await db
      .update(schema.dispatches)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(and(
        eq(schema.dispatches.id, id),
        eq(schema.dispatches.organisationId, c.orgId),
        eq(schema.dispatches.recipientUserId, c.sub),
        eq(schema.dispatches.status, "sent"),
      ))
      .returning({ id: schema.dispatches.id });
    if (!result[0]) return reply.code(409).send({ error: "not_yours_or_already_actioned" });
    return { ok: true };
  });

  app.post("/dispatches/:id/complete", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const conds = [
      eq(schema.dispatches.id, id),
      eq(schema.dispatches.organisationId, c.orgId),
      inArray(schema.dispatches.status, ["sent", "acknowledged"]),
    ];
    if (c.role === "cleaner") conds.push(eq(schema.dispatches.recipientUserId, c.sub));
    const result = await db
      .update(schema.dispatches)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(...conds))
      .returning({ id: schema.dispatches.id });
    if (!result[0]) return reply.code(409).send({ error: "not_yours_or_already_completed" });
    return { ok: true };
  });
}
