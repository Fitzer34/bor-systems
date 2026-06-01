import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

/**
 * PPM (Planned Preventive Maintenance) routes — admin + supervisor only.
 *
 *   GET    /ppms              — list the org's PPM tasks (soonest-due first)
 *   POST   /ppms              — create a task
 *   PATCH  /ppms/:id          — edit a task
 *   POST   /ppms/:id/complete — mark done; rolls the next due date forward
 *   DELETE /ppms/:id          — remove a task
 *
 * Reminders themselves are sent by services/ppm-reminder.ts, which scans
 * these rows on a timer and emails admins + supervisors as a task nears (or
 * passes) its due date. The dashboard shows due/overdue badges + a login
 * banner off the same data.
 */

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Completing a task schedules the next one: today + one interval, where the
// interval is 12 / frequency months (rounded, min 1 month). Completion-based
// (not due-date-based) so doing it early/late doesn't accumulate missed cycles.
function nextDueFromToday(frequencyPerYear: number): string {
  const monthsPerCycle = Math.max(1, Math.round(12 / Math.max(1, frequencyPerYear)));
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() + monthsPerCycle);
  return d.toISOString().slice(0, 10);
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  contractorName: z.string().max(200).nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  contactEmail: z.string().email().max(200).nullable().optional().or(z.literal("")),
  frequencyPerYear: z.number().int().min(1).max(52),
  nextDueDate: z.string().regex(ISO_DATE, "expected YYYY-MM-DD"),
  reminderLeadDays: z.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
});

export default async function ppmRoutes(app: FastifyInstance): Promise<void> {
  const staff = requireRole(["admin", "supervisor"]);

  // List the org's PPM tasks, soonest-due first.
  app.get("/ppms", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.ppms)
      .where(eq(schema.ppms.organisationId, c.orgId))
      .orderBy(asc(schema.ppms.nextDueDate));
    return { ppms: rows };
  });

  // Create a task.
  app.post("/ppms", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    }
    const c = ctx(req);
    const b = parsed.data;
    const [row] = await db
      .insert(schema.ppms)
      .values({
        organisationId: c.orgId,
        title: b.title.trim(),
        notes: b.notes?.trim() || null,
        contractorName: b.contractorName?.trim() || null,
        contactPhone: b.contactPhone?.trim() || null,
        contactEmail: b.contactEmail?.trim() || null,
        frequencyPerYear: b.frequencyPerYear,
        nextDueDate: b.nextDueDate,
        reminderLeadDays: b.reminderLeadDays ?? 14,
        active: b.active ?? true,
      })
      .returning();
    return reply.code(201).send({ ppm: row });
  });

  // Edit a task. All fields optional.
  app.patch("/ppms/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    }
    const c = ctx(req);
    const b = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (b.title !== undefined) updates.title = b.title.trim();
    if (b.notes !== undefined) updates.notes = b.notes?.trim() || null;
    if (b.contractorName !== undefined) updates.contractorName = b.contractorName?.trim() || null;
    if (b.contactPhone !== undefined) updates.contactPhone = b.contactPhone?.trim() || null;
    if (b.contactEmail !== undefined) updates.contactEmail = b.contactEmail?.trim() || null;
    if (b.frequencyPerYear !== undefined) updates.frequencyPerYear = b.frequencyPerYear;
    if (b.nextDueDate !== undefined) {
      updates.nextDueDate = b.nextDueDate;
      // A manual due-date change starts a fresh reminder cycle.
      updates.lastRemindedOn = null;
    }
    if (b.reminderLeadDays !== undefined) updates.reminderLeadDays = b.reminderLeadDays;
    if (b.active !== undefined) updates.active = b.active;

    await db
      .update(schema.ppms)
      .set(updates)
      .where(and(eq(schema.ppms.id, id), eq(schema.ppms.organisationId, c.orgId)));
    return { ok: true };
  });

  // Mark complete — record completion + roll the next due date forward, and
  // reset the reminder cycle so it goes quiet until the next one approaches.
  app.post("/ppms/:id/complete", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [existing] = await db
      .select()
      .from(schema.ppms)
      .where(and(eq(schema.ppms.id, id), eq(schema.ppms.organisationId, c.orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const next = nextDueFromToday(existing.frequencyPerYear);
    await db
      .update(schema.ppms)
      .set({
        lastCompletedAt: new Date(),
        nextDueDate: next,
        lastRemindedOn: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ppms.id, existing.id));
    return { ok: true, nextDueDate: next };
  });

  // Delete a task.
  app.delete("/ppms/:id", { preHandler: [app.authenticate, staff] }, async (req) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    await db
      .delete(schema.ppms)
      .where(and(eq(schema.ppms.id, id), eq(schema.ppms.organisationId, c.orgId)));
    return { ok: true };
  });
}
