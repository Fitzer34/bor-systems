import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

/**
 * Cleaning quality inspections. A worker runs a checklist, scoring each item;
 * the overall score rolls up. A deficient item can be turned into a maintenance
 * job (cross-discipline). Inspecting is open to any signed-in worker; raising a
 * job from a deficiency is staff-only.
 */

const RATING_SCORE: Record<string, number> = { meets: 100, acceptable: 70, needs_improvement: 0 };

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const createBody = z.object({
  buildingId: z.string().uuid().nullable().optional(),
  area: z.string().max(160).optional(),
  note: z.string().max(2000).optional(),
  inspectorName: z.string().max(120).optional(),
  items: z.array(z.object({
    label: z.string().min(1).max(200),
    rating: z.enum(["meets", "acceptable", "needs_improvement", "na"]),
    note: z.string().max(1000).optional(),
  })).min(1).max(100),
});

export default async function inspectionRoutes(app: FastifyInstance): Promise<void> {
  // List recent inspections (any worker), newest first, with building name.
  app.get("/inspections", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.inspections)
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.inspections.buildingId))
      .where(eq(schema.inspections.organisationId, c.orgId))
      .orderBy(desc(schema.inspections.createdAt))
      .limit(200);
    return {
      inspections: rows.map((r) => ({
        ...r.inspections,
        building: r.buildings?.id ? { id: r.buildings.id, name: r.buildings.name } : null,
      })),
    };
  });

  // One inspection with its scored items.
  app.get("/inspections/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [insp] = await db
      .select()
      .from(schema.inspections)
      .where(and(eq(schema.inspections.id, id), eq(schema.inspections.organisationId, c.orgId)))
      .limit(1);
    if (!insp) return reply.code(404).send({ error: "not_found" });
    const items = await db.select().from(schema.inspectionItems).where(eq(schema.inspectionItems.inspectionId, id));
    return { inspection: insp, items };
  });

  // Submit a completed inspection (any worker).
  app.post("/inspections", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;

    const scored = b.items.filter((i) => i.rating !== "na");
    const score = scored.length ? Math.round(scored.reduce((s, i) => s + (RATING_SCORE[i.rating] ?? 0), 0) / scored.length) : null;

    const [insp] = await db
      .insert(schema.inspections)
      .values({
        organisationId: c.orgId,
        buildingId: b.buildingId ?? null,
        area: b.area?.trim() || null,
        inspectorUserId: c.sub,
        inspectorName: b.inspectorName?.trim() || null,
        score,
        note: b.note?.trim() || null,
      })
      .returning();
    if (!insp) return reply.code(500).send({ error: "failed" });

    await db.insert(schema.inspectionItems).values(
      b.items.map((i) => ({
        organisationId: c.orgId,
        inspectionId: insp.id,
        label: i.label.trim(),
        rating: i.rating,
        note: i.note?.trim() || null,
      })),
    );
    return reply.code(201).send({ inspection: insp });
  });

  // Turn a deficient item into a maintenance job (staff only).
  app.post("/inspection-items/:id/raise-job", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [item] = await db
      .select()
      .from(schema.inspectionItems)
      .where(and(eq(schema.inspectionItems.id, id), eq(schema.inspectionItems.organisationId, c.orgId)))
      .limit(1);
    if (!item) return reply.code(404).send({ error: "not_found" });
    if (item.raisedJobId) return { ok: true, jobId: item.raisedJobId };

    const [insp] = await db.select().from(schema.inspections).where(eq(schema.inspections.id, item.inspectionId)).limit(1);
    const [job] = await db
      .insert(schema.maintenanceJobs)
      .values({
        organisationId: c.orgId,
        source: "manual",
        buildingId: insp?.buildingId ?? null,
        title: `Cleaning deficiency: ${item.label}`,
        description: `${item.note ? item.note + "\n\n" : ""}— Raised from a cleaning inspection${insp?.area ? ` (${insp.area})` : ""}`.trim(),
        priority: "routine",
        status: "logged",
      })
      .returning();
    if (!job) return reply.code(500).send({ error: "failed" });
    await db.insert(schema.jobEvents).values({
      organisationId: c.orgId,
      jobId: job.id,
      type: "logged",
      actorUserId: c.sub,
      detail: `Raised from a cleaning inspection deficiency: ${item.label}`,
    });
    await db.update(schema.inspectionItems).set({ raisedJobId: job.id }).where(eq(schema.inspectionItems.id, item.id));
    return { ok: true, jobId: job.id };
  });
}
