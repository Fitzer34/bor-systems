/**
 * Time & attendance.
 *
 *   GET    /time/status              my open entry (if clocked in) + hours open
 *   POST   /time/clock-in            start an entry (409 if one is open)
 *   POST   /time/clock-out           close my open entry → pending approval
 *   GET    /time/entries?from&to&userId
 *                                    staff: whole org (optionally one person);
 *                                    field staff: own entries only
 *   POST   /time/entries             staff manual entry (forgot-to-clock cases)
 *   PATCH  /time/entries/:id         staff edit times/break (marked as edited)
 *   POST   /time/entries/:id/approve staff approve one
 *   POST   /time/approve-all         staff approve every pending entry in range
 *   DELETE /time/entries/:id         staff remove a bad entry
 *   GET    /time/export.csv?from&to  staff payroll export (entries + totals)
 */
import type { FastifyInstance } from "fastify";
import { audit } from "../services/audit.js";
import { z } from "zod";
import { and, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireStaff = async (req: any, reply: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hoursOf(e: { clockInAt: Date; clockOutAt: Date | null; breakMinutes: number }): number | null {
  if (!e.clockOutAt) return null;
  const ms = e.clockOutAt.getTime() - e.clockInAt.getTime();
  const h = ms / 3_600_000 - (e.breakMinutes || 0) / 60;
  return Math.max(0, Math.round(h * 100) / 100);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Inclusive [from, to] date strings → [start, endExclusive] Dates. */
function rangeOf(from?: string, to?: string): { start: Date | null; end: Date | null } {
  const start = from ? new Date(from + "T00:00:00Z") : null;
  const end = to ? new Date(new Date(to + "T00:00:00Z").getTime() + 86_400_000) : null;
  return { start, end };
}

export default async function timesheetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/time/status", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const [open] = await db
      .select()
      .from(schema.timeEntries)
      .where(and(
        eq(schema.timeEntries.organisationId, c.orgId),
        eq(schema.timeEntries.userId, c.sub),
        isNull(schema.timeEntries.clockOutAt),
      ))
      .limit(1);
    if (!open) return { open: null };
    const hoursOpen = Math.round(((Date.now() - open.clockInAt.getTime()) / 3_600_000) * 100) / 100;
    return { open: { ...open, hoursOpen } };
  });

  app.post("/time/clock-in", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = z.object({
      buildingId: z.string().uuid().nullish(),
      note: z.string().max(300).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [already] = await db
      .select({ id: schema.timeEntries.id, clockInAt: schema.timeEntries.clockInAt })
      .from(schema.timeEntries)
      .where(and(
        eq(schema.timeEntries.organisationId, c.orgId),
        eq(schema.timeEntries.userId, c.sub),
        isNull(schema.timeEntries.clockOutAt),
      ))
      .limit(1);
    if (already) return reply.code(409).send({ error: "already_clocked_in", entry: already });
    const [row] = await db.insert(schema.timeEntries).values({
      organisationId: c.orgId,
      userId: c.sub,
      buildingId: parsed.data.buildingId ?? null,
      clockInAt: new Date(),
      note: parsed.data.note ?? null,
      source: "web",
      status: "open",
    }).returning();
    return { entry: row };
  });

  app.post("/time/clock-out", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = z.object({
      breakMinutes: z.number().int().min(0).max(600).optional(),
      note: z.string().max(300).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [open] = await db
      .select()
      .from(schema.timeEntries)
      .where(and(
        eq(schema.timeEntries.organisationId, c.orgId),
        eq(schema.timeEntries.userId, c.sub),
        isNull(schema.timeEntries.clockOutAt),
      ))
      .limit(1);
    if (!open) return reply.code(409).send({ error: "not_clocked_in" });
    const [row] = await db.update(schema.timeEntries)
      .set({
        clockOutAt: new Date(),
        status: "pending",
        ...(parsed.data.breakMinutes != null ? { breakMinutes: parsed.data.breakMinutes } : {}),
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
      })
      .where(eq(schema.timeEntries.id, open.id))
      .returning();
    return { entry: row };
  });

  app.get("/time/entries", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = z.object({
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
      userId: z.string().uuid().optional(),
    }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const role = (req as any).user?.role as string;
    const isStaff = role === "admin" || role === "supervisor";
    const conds = [eq(schema.timeEntries.organisationId, c.orgId)];
    if (!isStaff) conds.push(eq(schema.timeEntries.userId, c.sub));
    else if (q.data.userId) conds.push(eq(schema.timeEntries.userId, q.data.userId));
    const { start, end } = rangeOf(q.data.from, q.data.to);
    if (start) conds.push(gte(schema.timeEntries.clockInAt, start));
    if (end) conds.push(lt(schema.timeEntries.clockInAt, end));
    const rows = await db
      .select({
        entry: schema.timeEntries,
        userName: schema.users.name,
        userEmail: schema.users.email,
        buildingName: schema.buildings.name,
      })
      .from(schema.timeEntries)
      .innerJoin(schema.users, eq(schema.timeEntries.userId, schema.users.id))
      .leftJoin(schema.buildings, eq(schema.timeEntries.buildingId, schema.buildings.id))
      .where(and(...conds))
      .orderBy(schema.timeEntries.clockInAt)
      .limit(2000);
    return {
      entries: rows.map((r) => ({
        ...r.entry,
        userName: r.userName,
        userEmail: r.userEmail,
        buildingName: r.buildingName,
        hours: hoursOf(r.entry),
      })),
    };
  });

  const manualBody = z.object({
    userId: z.string().uuid(),
    buildingId: z.string().uuid().nullish(),
    clockInAt: z.string().datetime({ offset: true }),
    clockOutAt: z.string().datetime({ offset: true }),
    breakMinutes: z.number().int().min(0).max(600).default(0),
    note: z.string().max(300).optional(),
  });
  app.post("/time/entries", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = manualBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const cin = new Date(b.clockInAt);
    const cout = new Date(b.clockOutAt);
    if (cout <= cin) return reply.code(400).send({ error: "out_before_in" });
    const c = ctx(req);
    const [target] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.id, b.userId), eq(schema.users.organisationId, c.orgId))).limit(1);
    if (!target) return reply.code(404).send({ error: "not_found" });
    const [row] = await db.insert(schema.timeEntries).values({
      organisationId: c.orgId,
      userId: b.userId,
      buildingId: b.buildingId ?? null,
      clockInAt: cin,
      clockOutAt: cout,
      breakMinutes: b.breakMinutes,
      note: b.note ?? null,
      source: "manual",
      status: "pending",
      editedBy: c.sub,
    }).returning();
    return { entry: row };
  });

  const patchBody = z.object({
    clockInAt: z.string().datetime({ offset: true }).optional(),
    clockOutAt: z.string().datetime({ offset: true }).optional(),
    breakMinutes: z.number().int().min(0).max(600).optional(),
    buildingId: z.string().uuid().nullish(),
    note: z.string().max(300).nullish(),
  });
  app.patch("/time/entries/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const b = parsed.data;
    const [existing] = await db.select().from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.organisationId, c.orgId))).limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const cin = b.clockInAt ? new Date(b.clockInAt) : existing.clockInAt;
    const cout = b.clockOutAt ? new Date(b.clockOutAt) : existing.clockOutAt;
    if (cout && cout <= cin) return reply.code(400).send({ error: "out_before_in" });
    const [row] = await db.update(schema.timeEntries)
      .set({
        ...(b.clockInAt ? { clockInAt: cin } : {}),
        ...(b.clockOutAt ? { clockOutAt: cout, ...(existing.status === "open" ? { status: "pending" } : {}) } : {}),
        ...(b.breakMinutes != null ? { breakMinutes: b.breakMinutes } : {}),
        ...(b.buildingId !== undefined ? { buildingId: b.buildingId } : {}),
        ...(b.note !== undefined ? { note: b.note } : {}),
        editedBy: c.sub,
      })
      .where(eq(schema.timeEntries.id, id))
      .returning();
    return { entry: row };
  });

  app.post("/time/entries/:id/approve", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [existing] = await db.select().from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.organisationId, c.orgId))).limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    if (!existing.clockOutAt) return reply.code(409).send({ error: "still_clocked_in" });
    if (existing.status === "approved") return reply.code(409).send({ error: "already_approved" });
    const [row] = await db.update(schema.timeEntries)
      .set({ status: "approved", approvedBy: c.sub, approvedAt: new Date() })
      .where(eq(schema.timeEntries.id, id))
      .returning();
    audit(c.orgId, c.sub, "timesheet.approved", "time_entry", id, { userId: existing.userId });
    return { entry: row };
  });

  app.post("/time/approve-all", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const q = z.object({
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
    }).safeParse(req.body ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const conds = [
      eq(schema.timeEntries.organisationId, c.orgId),
      eq(schema.timeEntries.status, "pending"),
    ];
    const { start, end } = rangeOf(q.data.from, q.data.to);
    if (start) conds.push(gte(schema.timeEntries.clockInAt, start));
    if (end) conds.push(lt(schema.timeEntries.clockInAt, end));
    const rows = await db.update(schema.timeEntries)
      .set({ status: "approved", approvedBy: c.sub, approvedAt: new Date() })
      .where(and(...conds))
      .returning({ id: schema.timeEntries.id });
    return { approved: rows.length };
  });

  app.delete("/time/entries/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const rows = await db.delete(schema.timeEntries)
      .where(and(eq(schema.timeEntries.id, id), eq(schema.timeEntries.organisationId, c.orgId)))
      .returning({ id: schema.timeEntries.id });
    if (!rows.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.get("/time/export.csv", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const q = z.object({
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
    }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const conds = [eq(schema.timeEntries.organisationId, c.orgId)];
    const { start, end } = rangeOf(q.data.from, q.data.to);
    if (start) conds.push(gte(schema.timeEntries.clockInAt, start));
    if (end) conds.push(lt(schema.timeEntries.clockInAt, end));
    conds.push(lte(schema.timeEntries.clockInAt, new Date())); // no future rows
    const rows = await db
      .select({
        entry: schema.timeEntries,
        userName: schema.users.name,
        userEmail: schema.users.email,
        buildingName: schema.buildings.name,
      })
      .from(schema.timeEntries)
      .innerJoin(schema.users, eq(schema.timeEntries.userId, schema.users.id))
      .leftJoin(schema.buildings, eq(schema.timeEntries.buildingId, schema.buildings.id))
      .where(and(...conds))
      .orderBy(schema.users.name, schema.timeEntries.clockInAt)
      .limit(5000);

    const lines = ["Person,Email,Date,Clock in,Clock out,Break (min),Hours,Site,Status"];
    const totals = new Map<string, { name: string; email: string; hours: number }>();
    for (const r of rows) {
      const e = r.entry;
      const h = hoursOf(e);
      lines.push([
        csvCell(r.userName), csvCell(r.userEmail),
        e.clockInAt.toISOString().slice(0, 10),
        e.clockInAt.toISOString().slice(11, 16),
        e.clockOutAt ? e.clockOutAt.toISOString().slice(11, 16) : "",
        e.breakMinutes,
        h ?? "",
        csvCell(r.buildingName || ""),
        e.status,
      ].join(","));
      if (h != null) {
        const t = totals.get(r.userEmail) || { name: r.userName, email: r.userEmail, hours: 0 };
        t.hours += h;
        totals.set(r.userEmail, t);
      }
    }
    lines.push("");
    lines.push("Totals,,,,,,,,");
    for (const t of totals.values()) {
      lines.push([csvCell(t.name), csvCell(t.email), "", "", "", "", Math.round(t.hours * 100) / 100, "", ""].join(","));
    }
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="timesheets.csv"');
    return lines.join("\n") + "\n";
  });
}
