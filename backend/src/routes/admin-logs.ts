import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export default async function adminLogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/audit-log",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const q = querySchema.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const rows = await db
        .select({
          id: schema.auditLog.id,
          actorUserId: schema.auditLog.actorUserId,
          actorName: schema.users.name,
          actorEmail: schema.users.email,
          action: schema.auditLog.action,
          targetType: schema.auditLog.targetType,
          targetId: schema.auditLog.targetId,
          metadata: schema.auditLog.metadata,
          at: schema.auditLog.at,
        })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
        .orderBy(desc(schema.auditLog.at))
        .limit(q.data.limit)
        .offset(q.data.offset);
      return { entries: rows };
    },
  );

  app.get(
    "/admin/notifications-log",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const q = querySchema.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const rows = await db
        .select({
          id: schema.notifications.id,
          alertId: schema.notifications.alertId,
          userId: schema.notifications.userId,
          recipientName: schema.users.name,
          recipientEmail: schema.users.email,
          channel: schema.notifications.channel,
          kind: schema.notifications.kind,
          sentAt: schema.notifications.sentAt,
          delivered: schema.notifications.delivered,
          error: schema.notifications.error,
        })
        .from(schema.notifications)
        .leftJoin(schema.users, eq(schema.users.id, schema.notifications.userId))
        .orderBy(desc(schema.notifications.sentAt))
        .limit(q.data.limit)
        .offset(q.data.offset);
      return { entries: rows };
    },
  );
}
