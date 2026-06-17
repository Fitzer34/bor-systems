import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { notifyLoneWorkerHub } from "../services/lone-worker-watcher.js";

/**
 * Lone-worker safety. Any signed-in worker (cleaner / tech / guard) can run a
 * welfare-check-in session and hit panic; admins + supervisors monitor all live
 * sessions. Missed check-ins escalate via services/lone-worker-watcher.ts.
 */

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const LIVE: Array<"active" | "alarm"> = ["active", "alarm"];

export default async function loneWorkerRoutes(app: FastifyInstance): Promise<void> {
  // The current user's live session (active or in alarm), if any.
  app.get("/lone-worker/active", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const [s] = await db
      .select()
      .from(schema.loneWorkerSessions)
      .where(and(eq(schema.loneWorkerSessions.userId, c.sub), inArray(schema.loneWorkerSessions.status, LIVE)))
      .orderBy(desc(schema.loneWorkerSessions.startedAt))
      .limit(1);
    return { session: s ?? null };
  });

  // Start a session (ends any prior live one for this user first).
  app.post("/lone-worker/start", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ intervalMinutes: z.number().int().min(5).max(240), note: z.string().max(500).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    await db
      .update(schema.loneWorkerSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(schema.loneWorkerSessions.userId, c.sub), inArray(schema.loneWorkerSessions.status, LIVE)));
    const now = new Date();
    const due = new Date(now.getTime() + body.data.intervalMinutes * 60_000);
    const [s] = await db
      .insert(schema.loneWorkerSessions)
      .values({
        organisationId: c.orgId,
        userId: c.sub,
        status: "active",
        intervalMinutes: body.data.intervalMinutes,
        note: body.data.note?.trim() || null,
        lastCheckInAt: now,
        nextCheckInDueAt: due,
      })
      .returning();
    return { session: s };
  });

  // "I'm OK" — reset the timer.
  app.post("/lone-worker/check-in", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const [s] = await db
      .select()
      .from(schema.loneWorkerSessions)
      .where(and(eq(schema.loneWorkerSessions.userId, c.sub), eq(schema.loneWorkerSessions.status, "active")))
      .orderBy(desc(schema.loneWorkerSessions.startedAt))
      .limit(1);
    if (!s) return { session: null };
    const now = new Date();
    const due = new Date(now.getTime() + s.intervalMinutes * 60_000);
    const [u] = await db
      .update(schema.loneWorkerSessions)
      .set({ lastCheckInAt: now, nextCheckInDueAt: due })
      .where(eq(schema.loneWorkerSessions.id, s.id))
      .returning();
    return { session: u };
  });

  // Panic / SOS — raise an alarm immediately (works even with no active session).
  app.post("/lone-worker/panic", { preHandler: [app.authenticate] }, async (req, reply) => {
    const c = ctx(req);
    const now = new Date();
    const existing = (await db
      .select()
      .from(schema.loneWorkerSessions)
      .where(and(eq(schema.loneWorkerSessions.userId, c.sub), inArray(schema.loneWorkerSessions.status, LIVE)))
      .orderBy(desc(schema.loneWorkerSessions.startedAt))
      .limit(1))[0];
    let session;
    if (existing) {
      session = (await db
        .update(schema.loneWorkerSessions)
        .set({ status: "alarm", alarmReason: "panic", alarmAt: now })
        .where(eq(schema.loneWorkerSessions.id, existing.id))
        .returning())[0];
    } else {
      session = (await db
        .insert(schema.loneWorkerSessions)
        .values({ organisationId: c.orgId, userId: c.sub, status: "alarm", alarmReason: "panic", alarmAt: now, lastCheckInAt: now })
        .returning())[0];
    }
    if (!session) return reply.code(500).send({ error: "failed" });
    const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, c.sub)).limit(1);
    void notifyLoneWorkerHub(session, u?.name ?? "A worker");
    return { session };
  });

  // End my session (safe / stand down).
  app.post("/lone-worker/end", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    await db
      .update(schema.loneWorkerSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(schema.loneWorkerSessions.userId, c.sub), inArray(schema.loneWorkerSessions.status, LIVE)));
    return { ok: true };
  });

  // Monitoring hub (admins + supervisors): all live sessions, with worker name.
  app.get("/lone-worker/sessions", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select({
        id: schema.loneWorkerSessions.id,
        userId: schema.loneWorkerSessions.userId,
        status: schema.loneWorkerSessions.status,
        intervalMinutes: schema.loneWorkerSessions.intervalMinutes,
        note: schema.loneWorkerSessions.note,
        startedAt: schema.loneWorkerSessions.startedAt,
        lastCheckInAt: schema.loneWorkerSessions.lastCheckInAt,
        nextCheckInDueAt: schema.loneWorkerSessions.nextCheckInDueAt,
        alarmReason: schema.loneWorkerSessions.alarmReason,
        alarmAt: schema.loneWorkerSessions.alarmAt,
        userName: schema.users.name,
      })
      .from(schema.loneWorkerSessions)
      .leftJoin(schema.users, eq(schema.users.id, schema.loneWorkerSessions.userId))
      .where(and(eq(schema.loneWorkerSessions.organisationId, c.orgId), inArray(schema.loneWorkerSessions.status, LIVE)))
      .orderBy(desc(schema.loneWorkerSessions.startedAt));
    return { sessions: rows };
  });
}
