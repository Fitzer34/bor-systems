import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { getAllPrefs, setPrefs } from "../services/notification-centre.js";

/**
 * Notifications centre API — the current user's in-app feed + delivery prefs.
 *
 *   GET  /notifications?unread=&limit=&before=  → feed (newest first)
 *   GET  /notifications/unread-count            → { count }
 *   POST /notifications/:id/read                → mark one read
 *   POST /notifications/read-all                → mark all read
 *   GET  /notifications/preferences             → per-event-type channel prefs
 *   PUT  /notifications/preferences             → upsert one event type's prefs
 *
 * Everything is scoped to the caller (req.user). No role gating — every user has
 * their own feed.
 */
export default async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  const listQuery = z.object({
    unread: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    before: z.string().datetime().optional(), // created_at cursor for paging
  });

  app.get("/notifications", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);

    const conds = [
      eq(schema.userNotifications.userId, c.sub),
      eq(schema.userNotifications.organisationId, c.orgId),
    ];
    if (q.data.unread) conds.push(isNull(schema.userNotifications.readAt));
    if (q.data.before) conds.push(lt(schema.userNotifications.createdAt, new Date(q.data.before)));

    const rows = await db
      .select()
      .from(schema.userNotifications)
      .where(and(...conds))
      .orderBy(desc(schema.userNotifications.createdAt))
      .limit(q.data.limit);

    return { notifications: rows };
  });

  app.get("/notifications/unread-count", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.userNotifications)
      .where(and(
        eq(schema.userNotifications.userId, c.sub),
        eq(schema.userNotifications.organisationId, c.orgId),
        isNull(schema.userNotifications.readAt),
      ));
    return { count: row?.count ?? 0 };
  });

  app.post("/notifications/:id/read", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const updated = await db
      .update(schema.userNotifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(schema.userNotifications.id, id),
        eq(schema.userNotifications.userId, c.sub),
        isNull(schema.userNotifications.readAt),
      ))
      .returning({ id: schema.userNotifications.id });
    if (updated.length === 0) {
      // Either not found, not theirs, or already read — treat idempotently.
      const [exists] = await db
        .select({ id: schema.userNotifications.id })
        .from(schema.userNotifications)
        .where(and(eq(schema.userNotifications.id, id), eq(schema.userNotifications.userId, c.sub)))
        .limit(1);
      if (!exists) return reply.code(404).send({ error: "not_found" });
    }
    return { ok: true };
  });

  app.post("/notifications/read-all", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    await db
      .update(schema.userNotifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(schema.userNotifications.userId, c.sub),
        eq(schema.userNotifications.organisationId, c.orgId),
        isNull(schema.userNotifications.readAt),
      ));
    return { ok: true };
  });

  app.get("/notifications/preferences", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const preferences = await getAllPrefs(c.sub);
    return { preferences };
  });

  const putPrefsBody = z.object({
    eventType: z.string().min(1).max(80),
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
  });

  app.put("/notifications/preferences", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = putPrefsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const prefs = await setPrefs(c.orgId, c.sub, parsed.data.eventType, {
      inApp: parsed.data.inApp,
      email: parsed.data.email,
      sms: parsed.data.sms,
    });
    return { eventType: parsed.data.eventType, prefs };
  });
}
