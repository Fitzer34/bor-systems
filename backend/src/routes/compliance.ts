/**
 * Statutory compliance register — fire alarm service, EICR, gas cert,
 * legionella/TMV, lift LOLER, etc. Status is derived from next_due_on:
 * overdue (past), due_soon (within 30 days), ok.
 *
 *   GET    /compliance                list + derived status + counts
 *   POST   /compliance                add an item (staff)
 *   PATCH  /compliance/:id            edit (staff)
 *   DELETE /compliance/:id            remove (staff)
 *   POST   /compliance/:id/complete   mark done → advances next due date (staff)
 *   POST   /compliance/:id/document   attach the certificate PDF/photo (staff)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { visibleSiteIds, scopeRows } from "../services/site-membership.js";
import { uploadComplianceDoc } from "../services/storage.js";

const requireStaff = async (req: any, reply: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
};

const CATEGORIES = ["fire", "electrical", "gas", "water", "lifts", "hvac", "other"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OK_DOC_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** date string + N months → date string (clamps 31st → month end). */
function addMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, lastDay));
  return base.toISOString().slice(0, 10);
}

function statusOf(nextDueOn: string | null): "overdue" | "due_soon" | "ok" | "unscheduled" {
  if (!nextDueOn) return "unscheduled";
  const today = todayISO();
  if (nextDueOn < today) return "overdue";
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  return nextDueOn <= soon ? "due_soon" : "ok";
}

export default async function complianceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/compliance", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select({
        item: schema.complianceItems,
        buildingName: schema.buildings.name,
        contractorName: schema.contractors.name,
      })
      .from(schema.complianceItems)
      .leftJoin(schema.buildings, eq(schema.complianceItems.buildingId, schema.buildings.id))
      .leftJoin(schema.contractors, eq(schema.complianceItems.contractorId, schema.contractors.id))
      .where(eq(schema.complianceItems.organisationId, c.orgId))
      .orderBy(schema.complianceItems.nextDueOn)
      .limit(1000);
    // Membership: a restricted user sees their sites' items (plus org-wide
    // items with no building); the header counts follow the visible set.
    const scope = await visibleSiteIds(c.orgId, c.sub, c.role);
    const items = scopeRows(rows.map((r) => ({
      ...r.item,
      buildingName: r.buildingName,
      contractorName: r.contractorName,
      status: statusOf(r.item.nextDueOn),
    })), scope);
    const counts = { total: items.length, ok: 0, due_soon: 0, overdue: 0, unscheduled: 0 };
    for (const i of items) counts[i.status] += 1;
    return { items, counts };
  });

  const createBody = z.object({
    name: z.string().min(1).max(200),
    category: z.enum(CATEGORIES).default("other"),
    buildingId: z.string().uuid().nullish(),
    frequencyMonths: z.number().int().min(1).max(120).default(12),
    lastDoneOn: z.string().regex(DATE_RE).nullish(),
    nextDueOn: z.string().regex(DATE_RE).nullish(),
    contractorId: z.string().uuid().nullish(),
    note: z.string().max(1000).nullish(),
  });
  app.post("/compliance", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const c = ctx(req);
    // Next due can be given directly or derived from the last completion.
    const nextDueOn = b.nextDueOn ?? (b.lastDoneOn ? addMonths(b.lastDoneOn, b.frequencyMonths) : null);
    const [row] = await db.insert(schema.complianceItems).values({
      organisationId: c.orgId,
      name: b.name,
      category: b.category,
      buildingId: b.buildingId ?? null,
      frequencyMonths: b.frequencyMonths,
      lastDoneOn: b.lastDoneOn ?? null,
      nextDueOn,
      contractorId: b.contractorId ?? null,
      note: b.note ?? null,
    }).returning();
    return { item: { ...row, status: statusOf(row!.nextDueOn) } };
  });

  const patchBody = createBody.partial();
  app.patch("/compliance/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const b = parsed.data;
    const [row] = await db.update(schema.complianceItems)
      .set({
        ...(b.name != null ? { name: b.name } : {}),
        ...(b.category != null ? { category: b.category } : {}),
        ...(b.buildingId !== undefined ? { buildingId: b.buildingId } : {}),
        ...(b.frequencyMonths != null ? { frequencyMonths: b.frequencyMonths } : {}),
        ...(b.lastDoneOn !== undefined ? { lastDoneOn: b.lastDoneOn } : {}),
        ...(b.nextDueOn !== undefined ? { nextDueOn: b.nextDueOn } : {}),
        ...(b.contractorId !== undefined ? { contractorId: b.contractorId } : {}),
        ...(b.note !== undefined ? { note: b.note } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.complianceItems.id, id), eq(schema.complianceItems.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { item: { ...row, status: statusOf(row.nextDueOn) } };
  });

  app.delete("/compliance/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const rows = await db.delete(schema.complianceItems)
      .where(and(eq(schema.complianceItems.id, id), eq(schema.complianceItems.organisationId, c.orgId)))
      .returning({ id: schema.complianceItems.id });
    if (!rows.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/compliance/:id/complete", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = z.object({ doneOn: z.string().regex(DATE_RE).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [existing] = await db.select().from(schema.complianceItems)
      .where(and(eq(schema.complianceItems.id, id), eq(schema.complianceItems.organisationId, c.orgId))).limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const doneOn = parsed.data.doneOn ?? todayISO();
    const [row] = await db.update(schema.complianceItems)
      .set({ lastDoneOn: doneOn, nextDueOn: addMonths(doneOn, existing.frequencyMonths), updatedAt: new Date() })
      .where(eq(schema.complianceItems.id, id))
      .returning();
    return { item: { ...row, status: statusOf(row!.nextDueOn) } };
  });

  app.post("/compliance/:id/document", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [existing] = await db.select({ id: schema.complianceItems.id }).from(schema.complianceItems)
      .where(and(eq(schema.complianceItems.id, id), eq(schema.complianceItems.organisationId, c.orgId))).limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (!OK_DOC_MIMES.includes(file.mimetype)) return reply.code(400).send({ error: "unsupported_type" });
    const buf = await file.toBuffer();
    const { url } = await uploadComplianceDoc({
      filename: file.filename || "certificate.pdf",
      mimetype: file.mimetype || "application/pdf",
      body: buf,
    });
    const [row] = await db.update(schema.complianceItems)
      .set({ documentUrl: url, updatedAt: new Date() })
      .where(eq(schema.complianceItems.id, id))
      .returning();
    return { item: { ...row, status: statusOf(row!.nextDueOn) } };
  });
}
