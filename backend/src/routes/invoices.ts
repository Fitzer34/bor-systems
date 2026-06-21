import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { requireRole, requirePermission } from "../services/permissions.js";

/**
 * Invoices — a lightweight per-org billing register.
 *
 * An invoice is a numbered amount owed by a customer, optionally tied to a
 * building and/or a maintenance job. Money is held in minor units
 * (amountCents). Lifecycle: draft → sent → paid, with overdue / void as side
 * states. The daily reminder tick (services/maintenance-reminder.ts) flips a
 * 'sent' invoice past its due date (and unpaid) to 'overdue' and notifies
 * admins/supervisors (invoice.overdue).
 *
 * All routes are org-scoped, gated to admin/supervisor + the manage_billing
 * permission, and audit-logged. The web client is built against the exact
 * camelCase Invoice shape returned by `serialize` below.
 */

// Invoice numbers count up per org from this floor. The first invoice an org
// raises is INV-2050; subsequent ones are (max existing numeric suffix) + 1.
const INVOICE_NUMBER_START = 2050;

const STATUSES = ["draft", "sent", "paid", "overdue", "void"] as const;

const staff = requireRole(["admin", "supervisor"]);
const canBill = requirePermission("action.manage_billing");

const clean = (s?: string | null): string | null => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

/** Parse an ISO-8601 datetime string into a Date, or null when absent/blank. */
const toDate = (s?: string | null): Date | null => {
  const t = (s ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

type InvoiceRow = typeof schema.invoices.$inferSelect;

/** The exact JSON shape returned to clients (camelCase). */
function serialize(r: InvoiceRow) {
  return {
    id: r.id,
    organisationId: r.organisationId,
    number: r.number,
    customerName: r.customerName,
    buildingId: r.buildingId,
    jobId: r.jobId,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status,
    issuedAt: r.issuedAt,
    dueAt: r.dueAt,
    paidAt: r.paidAt,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

/**
 * Next invoice number for an org: max existing numeric suffix + 1, floored at
 * INVOICE_NUMBER_START. Scans the org's invoices (a handful per org in
 * practice); non-conforming numbers are ignored so a manual "INV-X" can't break
 * the sequence.
 */
async function nextInvoiceNumber(orgId: string): Promise<string> {
  const rows = await db
    .select({ number: schema.invoices.number })
    .from(schema.invoices)
    .where(eq(schema.invoices.organisationId, orgId));
  let max = INVOICE_NUMBER_START - 1;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.number ?? "");
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `INV-${max + 1}`;
}

async function audit(
  req: any,
  action: string,
  invoiceId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const c = ctx(req);
  await db.insert(schema.auditLog).values({
    organisationId: c.orgId,
    actorUserId: c.sub,
    action,
    targetType: "invoice",
    targetId: invoiceId,
    metadata,
  });
}

const createBody = z.object({
  customerName: z.string().max(200).optional(),
  amountCents: z.number().int().min(0).max(2_000_000_000),
  currency: z.string().min(3).max(3).optional(),
  dueAt: z.string().max(40).nullable().optional(),
  buildingId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  status: z.enum(STATUSES).optional(),
});

const patchBody = z.object({
  status: z.enum(STATUSES).optional(),
  customerName: z.string().max(200).nullable().optional(),
  amountCents: z.number().int().min(0).max(2_000_000_000).optional(),
  dueAt: z.string().max(40).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export default async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  // List the org's invoices, newest first. Optional ?status= filter.
  app.get("/invoices", { preHandler: [app.authenticate, staff, canBill] }, async (req) => {
    const c = ctx(req);
    const q = req.query as { status?: string };
    const filters = [eq(schema.invoices.organisationId, c.orgId)];
    if (q.status && (STATUSES as readonly string[]).includes(q.status)) {
      filters.push(eq(schema.invoices.status, q.status));
    }
    const rows = await db
      .select()
      .from(schema.invoices)
      .where(and(...filters))
      .orderBy(desc(schema.invoices.createdAt))
      .limit(500);
    return { invoices: rows.map(serialize) };
  });

  // One invoice.
  app.get("/invoices/:id", { preHandler: [app.authenticate, staff, canBill] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [row] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.organisationId, c.orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { invoice: serialize(row) };
  });

  // Create an invoice. `number` is auto-assigned (INV-#### per org). When a jobId
  // is given we prefill the customer name + amount from the awarded job/quote if
  // the caller didn't supply them (best-effort convenience, never overrides).
  app.post("/invoices", { preHandler: [app.authenticate, staff, canBill] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;

    // Validate any referenced building / job belongs to this org. Prefill from
    // the job when handy.
    let buildingId: string | null = b.buildingId ?? null;
    if (buildingId) {
      const [bld] = await db
        .select({ id: schema.buildings.id })
        .from(schema.buildings)
        .where(and(eq(schema.buildings.id, buildingId), eq(schema.buildings.organisationId, c.orgId)))
        .limit(1);
      if (!bld) return reply.code(400).send({ error: "invalid_building" });
    }

    let customerName = clean(b.customerName);
    let amountCents = b.amountCents;
    let jobId: string | null = b.jobId ?? null;
    if (jobId) {
      const [job] = await db
        .select()
        .from(schema.maintenanceJobs)
        .where(and(eq(schema.maintenanceJobs.id, jobId), eq(schema.maintenanceJobs.organisationId, c.orgId)))
        .limit(1);
      if (!job) return reply.code(400).send({ error: "invalid_job" });
      // Prefill from the job if the caller didn't pass these.
      if (!buildingId && job.buildingId) buildingId = job.buildingId;
      if (!customerName) customerName = clean(job.title);
      if (!amountCents && job.awardedQuoteId) {
        const [quote] = await db
          .select({ amountCents: schema.jobQuotes.amountCents })
          .from(schema.jobQuotes)
          .where(eq(schema.jobQuotes.id, job.awardedQuoteId))
          .limit(1);
        if (quote?.amountCents != null) amountCents = quote.amountCents;
      }
    }

    const status = b.status ?? "draft";
    const now = new Date();
    const dueAt = toDate(b.dueAt);

    const [row] = await db
      .insert(schema.invoices)
      .values({
        organisationId: c.orgId,
        number: await nextInvoiceNumber(c.orgId),
        customerName,
        buildingId,
        jobId,
        amountCents,
        currency: (b.currency ?? "EUR").toUpperCase(),
        status,
        // If created already 'sent'/'paid', stamp the matching timestamp so the
        // record is internally consistent.
        issuedAt: status === "sent" || status === "paid" ? now : null,
        paidAt: status === "paid" ? now : null,
        dueAt,
        notes: clean(b.notes),
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "failed" });

    await audit(req, "invoice.create", row.id, { number: row.number, amountCents: row.amountCents, status: row.status });
    return reply.code(201).send({ invoice: serialize(row) });
  });

  // Update an invoice. Status side-effects: → 'paid' stamps paid_at=now; → 'sent'
  // stamps issued_at=now if not already set.
  app.patch("/invoices/:id", { preHandler: [app.authenticate, staff, canBill] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;

    const [existing] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.organisationId, c.orgId)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const patch: Partial<typeof schema.invoices.$inferInsert> = {};
    if (b.customerName !== undefined) patch.customerName = clean(b.customerName);
    if (b.amountCents !== undefined) patch.amountCents = b.amountCents;
    if (b.dueAt !== undefined) patch.dueAt = toDate(b.dueAt);
    if (b.notes !== undefined) patch.notes = clean(b.notes);
    if (b.status !== undefined) {
      patch.status = b.status;
      if (b.status === "paid" && !existing.paidAt) patch.paidAt = new Date();
      if (b.status === "sent" && !existing.issuedAt) patch.issuedAt = new Date();
    }

    if (Object.keys(patch).length === 0) return { invoice: serialize(existing) };

    const [row] = await db
      .update(schema.invoices)
      .set(patch)
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });

    await audit(req, "invoice.update", row.id, { changed: Object.keys(patch) });
    return { invoice: serialize(row) };
  });

  // Hard-delete an invoice. Gated additionally on delete_records.
  app.delete(
    "/invoices/:id",
    { preHandler: [app.authenticate, staff, canBill, requirePermission("action.delete_records")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      const [existing] = await db
        .select({ id: schema.invoices.id, number: schema.invoices.number })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.id, id), eq(schema.invoices.organisationId, c.orgId)))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      await db
        .delete(schema.invoices)
        .where(and(eq(schema.invoices.id, id), eq(schema.invoices.organisationId, c.orgId)));
      await audit(req, "invoice.delete", id, { number: existing.number });
      return { ok: true };
    },
  );
}
