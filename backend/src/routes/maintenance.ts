/**
 * Maintenance platform — Phase 1 core loop.
 *
 *   log a job → tender to chosen contractors → quotes come back →
 *   compare preferred vs cheapest → award (with a recorded reason).
 *
 * Contractors are org-owned records (not app users); they're emailed and quotes
 * are entered against their tender invite. Trade-routing, AI scope/ranking,
 * scheduling and white-label email come in later chunks. See
 * docs/MAINTENANCE_PLATFORM_SPEC.md.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, eq, desc, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { sendEmail } from "../services/notifications.js";

const QUOTE_BASE = "https://app.hazardlink.ie";

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

/** Append a line to a job's timeline / audit trail. */
async function logJobEvent(
  orgId: string,
  jobId: string,
  type: string,
  actorUserId: string | null,
  detail?: string,
): Promise<void> {
  await db.insert(schema.jobEvents).values({
    organisationId: orgId,
    jobId,
    type,
    actorUserId,
    detail: detail ?? null,
  });
}

export default async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
  const staff = requireRole(["admin", "supervisor"]);

  // ─── Contractors ─────────────────────────────────────────────────────────
  app.get("/contractors", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.contractors)
      .where(eq(schema.contractors.organisationId, c.orgId))
      .orderBy(desc(schema.contractors.isPreferred), schema.contractors.name);
    return { contractors: rows };
  });

  const contractorBody = z.object({
    name: z.string().min(1).max(120),
    contactName: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    region: z.string().max(120).optional(),
    isPreferred: z.boolean().optional(),
    tradeIds: z.array(z.string().uuid()).optional(),
  });
  app.post("/contractors", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = contractorBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [created] = await db
      .insert(schema.contractors)
      .values({
        organisationId: c.orgId,
        name: parsed.data.name,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        region: parsed.data.region,
        isPreferred: parsed.data.isPreferred ?? false,
      })
      .returning();
    if (created && parsed.data.tradeIds?.length) {
      await db
        .insert(schema.contractorTrades)
        .values(parsed.data.tradeIds.map((tid) => ({ contractorId: created.id, tradeId: tid })));
    }
    return reply.code(201).send(created);
  });

  const contractorPatch = z.object({
    isPreferred: z.boolean().optional(),
    tier: z.enum(schema.contractorTier.enumValues).optional(),
    active: z.boolean().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
  });
  app.patch("/contractors/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = contractorPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [row] = await db
      .update(schema.contractors)
      .set(parsed.data)
      .where(and(eq(schema.contractors.id, id), eq(schema.contractors.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  // ─── Jobs ────────────────────────────────────────────────────────────────
  app.get("/jobs", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.maintenanceJobs)
      .where(eq(schema.maintenanceJobs.organisationId, c.orgId))
      .orderBy(desc(schema.maintenanceJobs.createdAt));
    return { jobs: rows };
  });

  const jobBody = z.object({
    title: z.string().min(1).max(160),
    description: z.string().max(4000).optional(),
    tradeId: z.string().uuid().optional(),
    priority: z.enum(schema.jobPriority.enumValues).optional(),
    buildingId: z.string().uuid().optional(),
    zoneId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    billTo: z.enum(schema.billToParty.enumValues).optional(),
    tenantId: z.string().uuid().optional(),
  });
  app.post("/jobs", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = jobBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [job] = await db
      .insert(schema.maintenanceJobs)
      .values({
        organisationId: c.orgId,
        title: parsed.data.title,
        description: parsed.data.description,
        tradeId: parsed.data.tradeId,
        priority: parsed.data.priority ?? "routine",
        buildingId: parsed.data.buildingId,
        zoneId: parsed.data.zoneId,
        assetId: parsed.data.assetId,
        billTo: parsed.data.billTo,
        tenantId: parsed.data.tenantId,
        reportedByUserId: c.sub,
        status: "logged",
      })
      .returning();
    if (!job) return reply.code(500).send({ error: "create_failed" });
    await logJobEvent(c.orgId, job.id, "logged", c.sub, parsed.data.title);
    return reply.code(201).send(job);
  });

  // Job detail = the job + its quotes (with contractor names) + its timeline.
  app.get("/jobs/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [job] = await db
      .select()
      .from(schema.maintenanceJobs)
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .limit(1);
    if (!job) return reply.code(404).send({ error: "not_found" });

    const quotes = await db
      .select({
        id: schema.jobQuotes.id,
        contractorId: schema.jobQuotes.contractorId,
        contractorName: schema.contractors.name,
        isPreferred: schema.contractors.isPreferred,
        status: schema.jobQuotes.status,
        amountCents: schema.jobQuotes.amountCents,
        upfrontCents: schema.jobQuotes.upfrontCents,
        upfrontPct: schema.jobQuotes.upfrontPct,
        proposedStartDate: schema.jobQuotes.proposedStartDate,
        notes: schema.jobQuotes.notes,
        submittedAt: schema.jobQuotes.submittedAt,
        token: schema.jobQuotes.token,
        contractorEmail: schema.contractors.email,
      })
      .from(schema.jobQuotes)
      .innerJoin(schema.contractors, eq(schema.contractors.id, schema.jobQuotes.contractorId))
      .where(eq(schema.jobQuotes.jobId, id));

    const events = await db
      .select()
      .from(schema.jobEvents)
      .where(eq(schema.jobEvents.jobId, id))
      .orderBy(desc(schema.jobEvents.createdAt));

    return { job, quotes, events };
  });

  // ─── Tender ──────────────────────────────────────────────────────────────
  // Invite chosen contractors — creates a "pending" quote per contractor and
  // flips the job to "tendering". (Trade-aware shortlisting + email come later.)
  const tenderBody = z.object({ contractorIds: z.array(z.string().uuid()).min(1) });
  app.post("/jobs/:id/tender", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = tenderBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);

    const [job] = await db
      .select()
      .from(schema.maintenanceJobs)
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .limit(1);
    if (!job) return reply.code(404).send({ error: "not_found" });

    const inserted = await db
      .insert(schema.jobQuotes)
      .values(
        parsed.data.contractorIds.map((cid) => ({
          jobId: id,
          organisationId: c.orgId,
          contractorId: cid,
          status: "pending" as const,
          token: randomBytes(18).toString("base64url"),
        })),
      )
      .returning();
    await db
      .update(schema.maintenanceJobs)
      .set({ status: "tendering", updatedAt: new Date() })
      .where(eq(schema.maintenanceJobs.id, id));
    await logJobEvent(c.orgId, id, "tendered", c.sub, `${parsed.data.contractorIds.length} contractor(s)`);

    // Email each invited contractor a no-login "submit your quote" magic link
    // (white-label; best-effort). They reply with a price + start date.
    void (async () => {
      try {
        const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, c.orgId)).limit(1);
        const orgName = org?.name ?? "Your client";
        const building = job.buildingId
          ? (await db.select({ name: schema.buildings.name }).from(schema.buildings).where(eq(schema.buildings.id, job.buildingId)).limit(1))[0]?.name ?? null
          : null;
        const cons = await db
          .select({ id: schema.contractors.id, name: schema.contractors.name, email: schema.contractors.email })
          .from(schema.contractors)
          .where(and(eq(schema.contractors.organisationId, c.orgId), inArray(schema.contractors.id, parsed.data.contractorIds)));
        const byId = new Map(cons.map((x) => [x.id, x]));
        for (const q of inserted) {
          const con = byId.get(q.contractorId);
          if (!con?.email || !q.token) continue;
          const url = `${QUOTE_BASE}/quote/${q.token}`;
          await sendEmail({
            to: con.email,
            fromName: orgName,
            subject: `Quote request: ${job.title}`,
            text: [
              con.name ? `Dear ${con.name},` : "Dear Sir or Madam,",
              ``,
              `${orgName} invites you to quote for the following work:`,
              ``,
              `    Job:   ${job.title}`,
              ...(building ? [`    Site:  ${building}`] : []),
              ...(job.description ? [`    Details: ${job.description}`] : []),
              ``,
              `Submit your quote (price + earliest start date) here — no login or account needed:`,
              ``,
              url,
              ``,
              `Kind regards,`,
              orgName,
            ].join("\n"),
          });
        }
      } catch (err) {
        console.error("tender email failed:", err);
      }
    })();

    return { ok: true };
  });

  // Record a quote a contractor sent back (orchestrator enters it for now).
  const quoteSubmit = z.object({
    amountCents: z.number().int().min(0),
    upfrontCents: z.number().int().min(0).optional(),
    upfrontPct: z.number().int().min(0).max(100).optional(),
    proposedStartDate: z.string().optional(), // ISO date
    notes: z.string().max(2000).optional(),
  });
  app.patch("/quotes/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = quoteSubmit.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [quote] = await db
      .update(schema.jobQuotes)
      .set({
        amountCents: parsed.data.amountCents,
        upfrontCents: parsed.data.upfrontCents,
        upfrontPct: parsed.data.upfrontPct,
        proposedStartDate: parsed.data.proposedStartDate,
        notes: parsed.data.notes,
        status: "submitted",
        submittedAt: new Date(),
      })
      .where(and(eq(schema.jobQuotes.id, id), eq(schema.jobQuotes.organisationId, c.orgId)))
      .returning();
    if (!quote) return reply.code(404).send({ error: "not_found" });
    // Job stays "tendering" while quotes come in — the quote count tells the story.
    await logJobEvent(c.orgId, quote.jobId, "quoted", c.sub);
    return quote;
  });

  // ─── Award ───────────────────────────────────────────────────────────────
  // Pick a quote. If it isn't the cheapest, a reason is required — that reason
  // is the recorded justification (feeds the budget/audit trail).
  const awardBody = z.object({ quoteId: z.string().uuid(), reason: z.string().max(500).optional() });
  app.post("/jobs/:id/award", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = awardBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);

    const quotes = await db
      .select()
      .from(schema.jobQuotes)
      .where(and(eq(schema.jobQuotes.jobId, id), eq(schema.jobQuotes.organisationId, c.orgId)));
    const chosen = quotes.find((q) => q.id === parsed.data.quoteId);
    if (!chosen) return reply.code(404).send({ error: "quote_not_found" });

    // Cheapest among submitted quotes — used to decide if a reason is required.
    const priced = quotes.filter((q) => q.status === "submitted" && q.amountCents != null);
    const cheapest = priced.reduce<typeof priced[number] | null>(
      (lo, q) => (lo == null || (q.amountCents ?? 0) < (lo.amountCents ?? 0) ? q : lo),
      null,
    );
    if (cheapest && chosen.id !== cheapest.id && !parsed.data.reason?.trim()) {
      return reply.code(400).send({ error: "reason_required_not_cheapest" });
    }

    await db.update(schema.jobQuotes).set({ status: "awarded" }).where(eq(schema.jobQuotes.id, chosen.id));
    // Everyone else who quoted/was invited is declined.
    for (const q of quotes) {
      if (q.id !== chosen.id) {
        await db.update(schema.jobQuotes).set({ status: "declined" }).where(eq(schema.jobQuotes.id, q.id));
      }
    }
    await db
      .update(schema.maintenanceJobs)
      .set({
        status: "awarded",
        awardedQuoteId: chosen.id,
        awardReason: parsed.data.reason ?? null,
        proposedStartAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.maintenanceJobs.id, id));
    const overCheapest =
      cheapest && chosen.amountCents != null && cheapest.amountCents != null
        ? chosen.amountCents - cheapest.amountCents
        : 0;
    await logJobEvent(
      c.orgId,
      id,
      "awarded",
      c.sub,
      overCheapest > 0
        ? `Awarded €${(chosen.amountCents! / 100).toFixed(0)} (€${(overCheapest / 100).toFixed(0)} over cheapest) — ${parsed.data.reason}`
        : `Awarded €${((chosen.amountCents ?? 0) / 100).toFixed(0)} (cheapest)`,
    );
    return { ok: true };
  });

  // ─── Work-order lifecycle: schedule → start → complete (or cancel) ────────
  // Works from any prior state, so internal jobs (incl. QR/incident-reported
  // ones) can skip tendering and go straight to scheduled/done.
  app.post("/jobs/:id/schedule", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ scheduledStartAt: z.string().datetime(), scheduledEndAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [job] = await db
      .update(schema.maintenanceJobs)
      .set({
        status: "scheduled",
        scheduledStartAt: new Date(body.data.scheduledStartAt),
        scheduledEndAt: body.data.scheduledEndAt ? new Date(body.data.scheduledEndAt) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .returning();
    if (!job) return reply.code(404).send({ error: "not_found" });
    await logJobEvent(c.orgId, id, "scheduled", c.sub, new Date(body.data.scheduledStartAt).toISOString().slice(0, 10));
    return { ok: true };
  });

  app.post("/jobs/:id/start", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [job] = await db
      .update(schema.maintenanceJobs)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .returning();
    if (!job) return reply.code(404).send({ error: "not_found" });
    await logJobEvent(c.orgId, id, "started", c.sub);
    return { ok: true };
  });

  app.post("/jobs/:id/complete", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ completionNote: z.string().max(2000).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [job] = await db
      .update(schema.maintenanceJobs)
      .set({ status: "completed", completedAt: new Date(), completionNote: body.data.completionNote?.trim() || null, updatedAt: new Date() })
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .returning();
    if (!job) return reply.code(404).send({ error: "not_found" });
    await logJobEvent(c.orgId, id, "completed", c.sub, body.data.completionNote?.trim() || undefined);
    return { ok: true };
  });

  app.post("/jobs/:id/cancel", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [job] = await db
      .update(schema.maintenanceJobs)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .returning();
    if (!job) return reply.code(404).send({ error: "not_found" });
    await logJobEvent(c.orgId, id, "cancelled", c.sub, body.data.reason?.trim() || undefined);
    return { ok: true };
  });

  // ─── Trades (taxonomy) ─────────────────────────────────────────────────────
  // Built-ins (organisation_id NULL) + this org's own customs ("Other").
  app.get("/trades", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.trades)
      .where(or(isNull(schema.trades.organisationId), eq(schema.trades.organisationId, c.orgId)))
      .orderBy(schema.trades.groupName, schema.trades.name);
    return { trades: rows };
  });

  const tradeBody = z.object({
    name: z.string().min(1).max(120),
    groupName: z.string().max(120).optional(),
    statutory: z.boolean().optional(),
  });
  app.post("/trades", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = tradeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [created] = await db
      .insert(schema.trades)
      .values({
        organisationId: c.orgId,
        name: parsed.data.name,
        groupName: parsed.data.groupName ?? "Other",
        statutory: parsed.data.statutory ?? false,
      })
      .returning();
    return reply.code(201).send(created);
  });

  // ─── Assets (register) ─────────────────────────────────────────────────────
  app.get("/assets", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.assets)
      .where(and(eq(schema.assets.organisationId, c.orgId), eq(schema.assets.retired, false)))
      .orderBy(schema.assets.name);
    return { assets: rows };
  });

  const assetBody = z.object({
    name: z.string().min(1).max(160),
    category: z.string().max(120).optional(),
    tradeId: z.string().uuid().nullable().optional(),
    buildingId: z.string().uuid().nullable().optional(),
    zoneId: z.string().uuid().nullable().optional(),
    make: z.string().max(120).optional(),
    model: z.string().max(120).optional(),
    serial: z.string().max(120).optional(),
    installDate: z.string().optional(),
    expectedLifeYears: z.number().int().min(0).max(100).optional(),
    warrantyExpiry: z.string().optional(),
    conditionScore: z.number().int().min(1).max(5).nullable().optional(),
    purchaseCostCents: z.number().int().min(0).nullable().optional(),
    replacementCostCents: z.number().int().min(0).nullable().optional(),
    notes: z.string().max(2000).optional(),
  });
  app.post("/assets", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = assetBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [created] = await db
      .insert(schema.assets)
      .values({ organisationId: c.orgId, reportToken: randomBytes(16).toString("hex"), ...parsed.data })
      .returning();
    return reply.code(201).send(created);
  });

  app.patch("/assets/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = assetBody.partial().extend({ retired: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [row] = await db
      .update(schema.assets)
      .set(parsed.data)
      .where(and(eq(schema.assets.id, id), eq(schema.assets.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  // ─── Parts & inventory ─────────────────────────────────────────────────────
  const partBody = z.object({
    name: z.string().min(1).max(160),
    sku: z.string().max(80).nullable().optional(),
    unit: z.string().max(20).optional(),
    stockQty: z.number().int().min(0).optional(),
    reorderLevel: z.number().int().min(0).optional(),
    unitCostCents: z.number().int().min(0).nullable().optional(),
    supplier: z.string().max(160).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  });

  app.get("/parts", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.parts)
      .where(eq(schema.parts.organisationId, c.orgId))
      .orderBy(schema.parts.name);
    return { parts: rows };
  });

  app.post("/parts", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = partBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [row] = await db.insert(schema.parts).values({ organisationId: c.orgId, ...parsed.data }).returning();
    return reply.code(201).send({ part: row });
  });

  app.patch("/parts/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = partBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [row] = await db
      .update(schema.parts)
      .set(parsed.data)
      .where(and(eq(schema.parts.id, id), eq(schema.parts.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { part: row };
  });

  // ─── Tenants (light register) ──────────────────────────────────────────────
  app.get("/tenants", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.organisationId, c.orgId))
      .orderBy(schema.tenants.name);
    return { tenants: rows };
  });

  const tenantBody = z.object({
    name: z.string().min(1).max(160),
    contactName: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    buildingId: z.string().uuid().optional(),
    areaNote: z.string().max(500).optional(),
  });
  app.post("/tenants", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = tenantBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [created] = await db
      .insert(schema.tenants)
      .values({ organisationId: c.orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(created);
  });
}
