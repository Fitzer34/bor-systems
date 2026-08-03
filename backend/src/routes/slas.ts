/**
 * SLA policies + computed compliance.
 *
 *   GET /slas?days=30   policies (defaults seeded on first read) + computed
 *                       stats over the window: per-priority response/resolve
 *                       hit rates and the list of breaches.
 *   PUT /slas           { policies: [{priority, responseMinutes, resolveMinutes}] }
 *
 * "Response" = the first job event after logging (someone actually did
 * something); "resolve" = job completed. Both computed from real
 * maintenance_jobs + job_events rows, never invented.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireStaff = async (req: any, reply: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
};

const PRIORITIES = ["emergency", "urgent", "routine"] as const;

const DEFAULTS: Record<(typeof PRIORITIES)[number], { responseMinutes: number; resolveMinutes: number }> = {
  emergency: { responseMinutes: 30, resolveMinutes: 240 },       // 30 min / 4 h
  urgent: { responseMinutes: 240, resolveMinutes: 1440 },        // 4 h / 24 h
  routine: { responseMinutes: 1440, resolveMinutes: 7200 },      // 24 h / 5 days
};

export default async function slaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/slas", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);

    // Policies — seed org defaults on first read so PUT is always an update.
    let policies = await db.select().from(schema.slaPolicies)
      .where(eq(schema.slaPolicies.organisationId, c.orgId));
    if (policies.length === 0) {
      policies = await db.insert(schema.slaPolicies).values(
        PRIORITIES.map((p) => ({
          organisationId: c.orgId,
          priority: p,
          responseMinutes: DEFAULTS[p].responseMinutes,
          resolveMinutes: DEFAULTS[p].resolveMinutes,
        })),
      ).returning();
    }
    const byPriority = new Map(policies.map((p) => [p.priority, p]));

    // Jobs raised in the window.
    const since = new Date(Date.now() - q.data.days * 86_400_000);
    const jobs = await db
      .select({
        id: schema.maintenanceJobs.id,
        title: schema.maintenanceJobs.title,
        priority: schema.maintenanceJobs.priority,
        status: schema.maintenanceJobs.status,
        createdAt: schema.maintenanceJobs.createdAt,
        completedAt: schema.maintenanceJobs.completedAt,
      })
      .from(schema.maintenanceJobs)
      .where(and(
        eq(schema.maintenanceJobs.organisationId, c.orgId),
        gte(schema.maintenanceJobs.createdAt, since),
      ))
      .limit(1000);

    // First human/system action per job = earliest non-"logged" event.
    const firstAction = new Map<string, Date>();
    if (jobs.length) {
      const events = await db
        .select({
          jobId: schema.jobEvents.jobId,
          type: schema.jobEvents.type,
          createdAt: schema.jobEvents.createdAt,
        })
        .from(schema.jobEvents)
        .where(inArray(schema.jobEvents.jobId, jobs.map((j) => j.id)))
        .limit(5000);
      for (const e of events) {
        if (e.type === "logged") continue;
        const cur = firstAction.get(e.jobId);
        if (!cur || e.createdAt < cur) firstAction.set(e.jobId, e.createdAt);
      }
    }

    const now = Date.now();
    const perPriority = PRIORITIES.map((p) => ({
      priority: p,
      responseMinutes: byPriority.get(p)?.responseMinutes ?? DEFAULTS[p].responseMinutes,
      resolveMinutes: byPriority.get(p)?.resolveMinutes ?? DEFAULTS[p].resolveMinutes,
      jobs: 0,
      responded: 0,
      respondedInTarget: 0,
      resolved: 0,
      resolvedInTarget: 0,
    }));
    const rowFor = (p: string) => perPriority.find((r) => r.priority === p) ?? perPriority[2]!;

    const breaches: Array<{
      jobId: string; title: string; priority: string;
      kind: "response" | "resolve"; minutes: number; targetMinutes: number; open: boolean;
    }> = [];

    for (const j of jobs) {
      const row = rowFor(j.priority);
      row.jobs += 1;
      const respTargetMs = row.responseMinutes * 60_000;
      const resTargetMs = row.resolveMinutes * 60_000;
      const created = j.createdAt.getTime();

      const first = firstAction.get(j.id);
      if (first) {
        row.responded += 1;
        const mins = Math.round((first.getTime() - created) / 60_000);
        if (first.getTime() - created <= respTargetMs) row.respondedInTarget += 1;
        else breaches.push({ jobId: j.id, title: j.title, priority: j.priority, kind: "response", minutes: mins, targetMinutes: row.responseMinutes, open: false });
      } else if (now - created > respTargetMs && j.status !== "completed" && j.status !== "cancelled") {
        // Still untouched and already past the response target.
        breaches.push({ jobId: j.id, title: j.title, priority: j.priority, kind: "response", minutes: Math.round((now - created) / 60_000), targetMinutes: row.responseMinutes, open: true });
      }

      if (j.completedAt) {
        row.resolved += 1;
        const mins = Math.round((j.completedAt.getTime() - created) / 60_000);
        if (j.completedAt.getTime() - created <= resTargetMs) row.resolvedInTarget += 1;
        else breaches.push({ jobId: j.id, title: j.title, priority: j.priority, kind: "resolve", minutes: mins, targetMinutes: row.resolveMinutes, open: false });
      } else if (now - created > resTargetMs && j.status !== "cancelled") {
        breaches.push({ jobId: j.id, title: j.title, priority: j.priority, kind: "resolve", minutes: Math.round((now - created) / 60_000), targetMinutes: row.resolveMinutes, open: true });
      }
    }

    breaches.sort((a, b) => b.minutes / b.targetMinutes - a.minutes / a.targetMinutes);

    return {
      policies: perPriority.map((r) => ({
        priority: r.priority,
        responseMinutes: r.responseMinutes,
        resolveMinutes: r.resolveMinutes,
      })),
      stats: {
        windowDays: q.data.days,
        perPriority: perPriority.map((r) => ({
          ...r,
          responsePct: r.responded ? Math.round((r.respondedInTarget / r.responded) * 100) : null,
          resolvePct: r.resolved ? Math.round((r.resolvedInTarget / r.resolved) * 100) : null,
        })),
        breaches: breaches.slice(0, 50),
      },
    };
  });

  const putBody = z.object({
    policies: z.array(z.object({
      priority: z.enum(PRIORITIES),
      responseMinutes: z.number().int().min(5).max(60 * 24 * 30),
      resolveMinutes: z.number().int().min(5).max(60 * 24 * 90),
    })).min(1).max(3),
  });
  app.put("/slas", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    for (const p of parsed.data.policies) {
      if (p.resolveMinutes < p.responseMinutes) return reply.code(400).send({ error: "resolve_before_response" });
      const [existing] = await db.select({ id: schema.slaPolicies.id }).from(schema.slaPolicies)
        .where(and(eq(schema.slaPolicies.organisationId, c.orgId), eq(schema.slaPolicies.priority, p.priority)))
        .limit(1);
      if (existing) {
        await db.update(schema.slaPolicies)
          .set({ responseMinutes: p.responseMinutes, resolveMinutes: p.resolveMinutes, updatedAt: new Date() })
          .where(eq(schema.slaPolicies.id, existing.id));
      } else {
        await db.insert(schema.slaPolicies).values({
          organisationId: c.orgId,
          priority: p.priority,
          responseMinutes: p.responseMinutes,
          resolveMinutes: p.resolveMinutes,
        });
      }
    }
    const policies = await db.select().from(schema.slaPolicies)
      .where(eq(schema.slaPolicies.organisationId, c.orgId));
    return { policies };
  });
}
