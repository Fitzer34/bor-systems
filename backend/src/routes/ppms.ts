import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { sendEmail } from "../services/notifications.js";
import { requestPpmSchedule, scheduleUrl } from "../services/ppm-schedule.js";

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

// Render a YYYY-MM-DD as a readable "Friday, 19 June 2026" for emails.
function formatLongDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  buildingId: z.string().uuid().nullable().optional(),
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

  // List the org's PPM tasks, soonest-due first. Each task carries its latest
  // scheduling request (if any) so the UI can show "awaiting contractor",
  // "proposed 12 Jul — approve?", or "scheduled" inline.
  app.get("/ppms", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const joined = await db
      .select()
      .from(schema.ppms)
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.ppms.buildingId))
      .where(eq(schema.ppms.organisationId, c.orgId))
      .orderBy(asc(schema.ppms.nextDueDate));
    // Flatten the join and attach the building's site details (location +
    // on-site contact) so the UI can show them and the contractor email uses them.
    const rows = joined.map((j) => ({
      ...j.ppms,
      building: j.buildings?.id
        ? {
            id: j.buildings.id,
            name: j.buildings.name,
            address: j.buildings.address,
            siteContactName: j.buildings.siteContactName,
            siteContactPhone: j.buildings.siteContactPhone,
            siteContactEmail: j.buildings.siteContactEmail,
          }
        : null,
    }));

    // Latest schedule request per task (newest first; first seen per ppm wins).
    const ids = rows.map((r) => r.id);
    const latest: Record<string, unknown> = {};
    if (ids.length) {
      const reqs = await db
        .select({
          id: schema.ppmScheduleRequests.id,
          ppmId: schema.ppmScheduleRequests.ppmId,
          status: schema.ppmScheduleRequests.status,
          sentToEmail: schema.ppmScheduleRequests.sentToEmail,
          emailDelivered: schema.ppmScheduleRequests.emailDelivered,
          proposedDate: schema.ppmScheduleRequests.proposedDate,
          confirmedDate: schema.ppmScheduleRequests.confirmedDate,
          contractorNote: schema.ppmScheduleRequests.contractorNote,
          token: schema.ppmScheduleRequests.token,
          respondedAt: schema.ppmScheduleRequests.respondedAt,
          expiresAt: schema.ppmScheduleRequests.expiresAt,
          createdAt: schema.ppmScheduleRequests.createdAt,
        })
        .from(schema.ppmScheduleRequests)
        .where(inArray(schema.ppmScheduleRequests.ppmId, ids))
        .orderBy(desc(schema.ppmScheduleRequests.createdAt));
      for (const r of reqs) {
        if (!latest[r.ppmId]) latest[r.ppmId] = { ...r, scheduleUrl: scheduleUrl(r.token) };
      }
    }
    return { ppms: rows.map((p) => ({ ...p, schedule: latest[p.id] ?? null })) };
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
        buildingId: b.buildingId ?? null,
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
    if (b.buildingId !== undefined) updates.buildingId = b.buildingId || null;
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
        // Clear the booked date — the next cycle starts unscheduled.
        scheduledDate: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ppms.id, existing.id));
    // Any outreach still in flight for the cycle just completed is moot.
    await db
      .update(schema.ppmScheduleRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(schema.ppmScheduleRequests.ppmId, existing.id),
        inArray(schema.ppmScheduleRequests.status, ["sent", "proposed"]),
      ));
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

  // ─── Contractor scheduling ─────────────────────────────────────────────────

  // Email the PPM's contractor a magic link to pick a visit date. Also used to
  // re-send if they didn't reply. Returns the request + the link so the UI can
  // show "awaiting contractor" and offer a copy-link button (handy before SMTP
  // is configured, or to send via WhatsApp/phone).
  app.post("/ppms/:id/request-schedule", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [p] = await db
      .select({ id: schema.ppms.id })
      .from(schema.ppms)
      .where(and(eq(schema.ppms.id, id), eq(schema.ppms.organisationId, c.orgId)))
      .limit(1);
    if (!p) return reply.code(404).send({ error: "not_found" });

    const result = await requestPpmSchedule(id, { createdByUserId: c.sub });
    if (!result.ok || !result.request) {
      return reply.code(400).send({ error: result.error ?? "request_failed" });
    }
    return {
      ok: true,
      request: result.request,
      scheduleUrl: scheduleUrl(result.request.token),
      emailDelivered: result.request.emailDelivered,
      emailError: result.emailError ?? null,
    };
  });

  // Confirm a contractor's proposed date (or a date staff override). Stamps the
  // PPM's scheduled date and best-effort emails the contractor a confirmation.
  app.post("/ppm-schedule-requests/:id/confirm", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const parsed = z.object({ date: z.string().regex(ISO_DATE).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const [r] = await db
      .select()
      .from(schema.ppmScheduleRequests)
      .where(and(
        eq(schema.ppmScheduleRequests.id, id),
        eq(schema.ppmScheduleRequests.organisationId, c.orgId),
      ))
      .limit(1);
    if (!r) return reply.code(404).send({ error: "not_found" });

    const date = parsed.data.date ?? r.proposedDate;
    if (!date) return reply.code(400).send({ error: "no_date" });

    await db
      .update(schema.ppmScheduleRequests)
      .set({ status: "confirmed", confirmedDate: date, updatedAt: new Date() })
      .where(eq(schema.ppmScheduleRequests.id, r.id));
    await db
      .update(schema.ppms)
      .set({ scheduledDate: date, updatedAt: new Date() })
      .where(eq(schema.ppms.id, r.ppmId));

    // Tell the contractor it's booked (best-effort — never blocks the response).
    if (r.sentToEmail) {
      const [ppm] = await db.select().from(schema.ppms).where(eq(schema.ppms.id, r.ppmId)).limit(1);
      const [org] = await db
        .select({ name: schema.organisations.name })
        .from(schema.organisations)
        .where(eq(schema.organisations.id, c.orgId))
        .limit(1);
      const orgName = org?.name ?? "Your client";
      const niceDate = formatLongDate(date);
      let building: typeof schema.buildings.$inferSelect | null = null;
      if (ppm?.buildingId) {
        const [bld] = await db.select().from(schema.buildings).where(eq(schema.buildings.id, ppm.buildingId)).limit(1);
        building = bld ?? null;
      }
      const contact = building
        ? [building.siteContactName, building.siteContactPhone, building.siteContactEmail].filter(Boolean).join(" · ")
        : "";
      void sendEmail({
        to: r.sentToEmail,
        subject: `Appointment confirmed: ${ppm?.title ?? "your visit"} — ${niceDate}`,
        text: [
          ppm?.contractorName ? `Dear ${ppm.contractorName},` : "Dear Sir or Madam,",
          ``,
          `Thank you for confirming your availability. We are pleased to confirm the following appointment:`,
          ``,
          `    Job:   ${ppm?.title ?? "Planned maintenance"}`,
          `    Date:  ${niceDate}`,
          ...(building?.name ? [`    Site:  ${building.name}${building.address ? ", " + building.address : ""}`] : []),
          ...(contact ? [`    On-site contact: ${contact}`] : []),
          ...(ppm?.notes ? [`    Notes: ${ppm.notes}`] : []),
          ``,
          `This date is now booked in our system. If anything changes, please let us know as soon as possible so we can rearrange.`,
          ``,
          `We look forward to seeing you then.`,
          ``,
          `Kind regards,`,
          orgName,
        ].join("\n"),
        fromName: orgName,
      });
    }
    return { ok: true, confirmedDate: date };
  });

  // Withdraw an outreach (e.g. arranged another way, or contractor unresponsive).
  app.post("/ppm-schedule-requests/:id/cancel", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const res = await db
      .update(schema.ppmScheduleRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(schema.ppmScheduleRequests.id, id),
        eq(schema.ppmScheduleRequests.organisationId, c.orgId),
      ))
      .returning({ id: schema.ppmScheduleRequests.id });
    if (!res.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
