/**
 * Growth-avenue routes — the customer-acquisition surfaces:
 *
 *   Contractor loop
 *     GET    /public/contractor/:token            profile + document vault (claim page)
 *     POST   /public/contractor/:token            update profile / claim / directory opt-in
 *     POST   /public/contractor/:token/document   upload a vault document (pdf/image)
 *     DELETE /public/contractor/:token/document/:docId
 *     GET    /public/directory                    opt-in cross-org contractor directory
 *     POST   /contractors/:id/claim-invite        (authed) email the claim link
 *     GET    /contractors/:id/documents           (authed) view a contractor's vault
 *
 *   Partner channel
 *     POST   /public/partner-lead                 marketing-site enquiry form
 *
 *   Visitors
 *     GET    /visitors?buildingId&day             day sheet
 *     POST   /visitors                            expected visitor or walk-in sign-in
 *     POST   /visitors/:id/sign-in | /sign-out
 *     DELETE /visitors/:id
 *
 *   Exports ("audit-ready" packaging)
 *     GET /reports/audit-pack                     printable HTML evidence pack
 *     GET /invoices/export.csv                    Xero/Sage-importable invoice CSV
 *     GET /reports/energy.csv                     meter readings export
 *
 *   Integrations
 *     GET/PUT /settings/integrations              Teams incoming-webhook URL
 */
import type { FastifyInstance } from "fastify";
import { audit } from "../services/audit.js";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { requirePermission } from "../services/permissions.js";
import { sendEmail, sendEmailToUser } from "../services/notifications.js";
import { uploadContractorDoc } from "../services/storage.js";
import { toCsv, csvFilename } from "../services/csv.js";
import { buildAuditPack } from "../services/audit-pack.js";
import { getIntegrationSettings, setIntegrationSettings } from "../services/teams.js";
import { config } from "../config.js";

const APP_BASE = "https://app.hazardlink.ie";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const publicWriteLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
const publicReadLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

const DOC_TYPES = ["insurance", "safe_pass", "manual_handling", "rams", "method_statement", "cert", "other"] as const;
const OK_DOC_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function contractorByToken(token: string) {
  if (!token || token.length < 10) return null;
  const [row] = await db
    .select()
    .from(schema.contractors)
    .where(and(eq(schema.contractors.claimToken, token), eq(schema.contractors.active, true)))
    .limit(1);
  return row ?? null;
}

function serializeDoc(d: typeof schema.contractorDocuments.$inferSelect) {
  return { id: d.id, type: d.type, name: d.name, url: d.url, expiresOn: d.expiresOn, uploadedAt: d.uploadedAt };
}

export default async function growthRoutes(app: FastifyInstance): Promise<void> {
  /* ══════════════════ Contractor loop — public claim page ══════════════════ */

  app.get("/public/contractor/:token", publicReadLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const con = await contractorByToken(token);
    if (!con) return reply.code(404).send({ error: "not_found" });
    const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, con.organisationId)).limit(1);
    const docs = await db.select().from(schema.contractorDocuments).where(eq(schema.contractorDocuments.contractorId, con.id)).orderBy(desc(schema.contractorDocuments.uploadedAt));
    return {
      contractor: {
        name: con.name, contactName: con.contactName, email: con.email, phone: con.phone,
        county: con.county, services: con.services, bio: con.bio,
        publicListed: con.publicListed, claimedAt: con.claimedAt,
      },
      invitedBy: org?.name ?? null,
      documents: docs.map(serializeDoc),
    };
  });

  const claimBody = z.object({
    contactName: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    county: z.string().max(60).optional(),
    services: z.string().max(300).optional(),
    bio: z.string().max(2000).optional(),
    publicListed: z.boolean().optional(),
  });
  app.post("/public/contractor/:token", publicWriteLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const con = await contractorByToken(token);
    if (!con) return reply.code(404).send({ error: "not_found" });
    const parsed = claimBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    await db
      .update(schema.contractors)
      .set({
        ...(b.contactName !== undefined ? { contactName: b.contactName } : {}),
        ...(b.phone !== undefined ? { phone: b.phone } : {}),
        ...(b.county !== undefined ? { county: b.county } : {}),
        ...(b.services !== undefined ? { services: b.services } : {}),
        ...(b.bio !== undefined ? { bio: b.bio } : {}),
        ...(b.publicListed !== undefined ? { publicListed: b.publicListed } : {}),
        ...(con.claimedAt ? {} : { claimedAt: new Date() }),
      })
      .where(eq(schema.contractors.id, con.id));
    return { ok: true };
  });

  app.post("/public/contractor/:token/document", publicWriteLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const con = await contractorByToken(token);
    if (!con) return reply.code(404).send({ error: "not_found" });

    const existing = await db.select({ id: schema.contractorDocuments.id }).from(schema.contractorDocuments).where(eq(schema.contractorDocuments.contractorId, con.id));
    if (existing.length >= 25) return reply.code(400).send({ error: "too_many_documents" });

    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (file.mimetype && !OK_DOC_MIMES.includes(file.mimetype)) {
      return reply.code(415).send({ error: "must_be_pdf_or_image" });
    }
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: "too_large" });
    }

    // Extra multipart text fields ride alongside the file part.
    const fields: any = file.fields || {};
    const fv = (k: string): string | undefined => {
      const f = fields[k];
      return f && typeof f === "object" && "value" in f ? String((f as any).value) : undefined;
    };
    const type = (DOC_TYPES as readonly string[]).includes(fv("type") ?? "") ? (fv("type") as string) : "other";
    const name = (fv("name") || file.filename || "Document").slice(0, 160);
    const expiresOnRaw = fv("expiresOn");
    const expiresOn = expiresOnRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiresOnRaw) ? expiresOnRaw : null;

    const { url } = await uploadContractorDoc({
      filename: file.filename || "document.pdf",
      mimetype: file.mimetype || "application/pdf",
      body: buf,
    });
    const [row] = await db
      .insert(schema.contractorDocuments)
      .values({ organisationId: con.organisationId, contractorId: con.id, type, name, url, expiresOn })
      .returning();
    return { document: serializeDoc(row!) };
  });

  app.delete("/public/contractor/:token/document/:docId", publicWriteLimit, async (req, reply) => {
    const { token, docId } = req.params as { token: string; docId: string };
    const con = await contractorByToken(token);
    if (!con) return reply.code(404).send({ error: "not_found" });
    await db
      .delete(schema.contractorDocuments)
      .where(and(eq(schema.contractorDocuments.id, docId), eq(schema.contractorDocuments.contractorId, con.id)));
    return { ok: true };
  });

  /* ══════════════════ Public contractor directory ══════════════════ */

  app.get("/public/directory", publicReadLimit, async (req, reply) => {
    const q = z.object({ county: z.string().max(60).optional(), q: z.string().max(80).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });

    const listed = await db
      .select()
      .from(schema.contractors)
      .where(and(eq(schema.contractors.publicListed, true), eq(schema.contractors.active, true)))
      .limit(500);

    const needle = (q.data.q ?? "").toLowerCase();
    const county = (q.data.county ?? "").toLowerCase();
    const filtered = listed.filter((c) => {
      if (county && (c.county ?? "").toLowerCase() !== county) return false;
      if (needle) {
        const hay = `${c.name} ${c.services ?? ""} ${c.bio ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const ids = filtered.map((c) => c.id);
    const docs = ids.length
      ? await db.select().from(schema.contractorDocuments).where(inArray(schema.contractorDocuments.contractorId, ids))
      : [];
    const docsByCon = new Map<string, typeof docs>();
    for (const d of docs) {
      const arr = docsByCon.get(d.contractorId) ?? [];
      arr.push(d);
      docsByCon.set(d.contractorId, arr);
    }
    const today = new Date().toISOString().slice(0, 10);

    return {
      contractors: filtered
        .map((c) => {
          const ds = docsByCon.get(c.id) ?? [];
          const insuranceValid =
            ds.some((d) => d.type === "insurance" && d.expiresOn && d.expiresOn >= today) ||
            (c.insuranceExpiry != null && String(c.insuranceExpiry) >= today);
          return {
            id: c.id,
            name: c.name,
            county: c.county,
            services: c.services,
            bio: c.bio,
            rating: c.ratingAvg,
            documentCount: ds.length,
            insuranceValid,
            claimed: !!c.claimedAt,
          };
        })
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name))
        .slice(0, 200),
    };
  });

  /* Add a directory-listed contractor to the caller's own org — the "contact/
     hire from the directory" action. Copies the public profile fields into a
     fresh contractors row (unclaimed, unlisted) so the org can tender them
     through the normal flow. Dedupes on email within the org. */
  app.post(
    "/directory/:contractorId/add",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { contractorId } = req.params as { contractorId: string };
      const c = ctx(req);
      const [src] = await db
        .select()
        .from(schema.contractors)
        .where(and(
          eq(schema.contractors.id, contractorId),
          eq(schema.contractors.publicListed, true),
          eq(schema.contractors.active, true),
        ))
        .limit(1);
      if (!src) return reply.code(404).send({ error: "not_found" });
      if (src.organisationId === c.orgId) {
        return { contractor: src, existed: true };
      }
      if (src.email) {
        const [dupe] = await db
          .select()
          .from(schema.contractors)
          .where(and(eq(schema.contractors.organisationId, c.orgId), eq(schema.contractors.email, src.email)))
          .limit(1);
        if (dupe) return { contractor: dupe, existed: true };
      }
      const [row] = await db
        .insert(schema.contractors)
        .values({
          organisationId: c.orgId,
          name: src.name,
          contactName: src.contactName,
          email: src.email,
          phone: src.phone,
          region: src.region ?? src.county,
          county: src.county,
          services: src.services,
          bio: src.bio,
          insuranceExpiry: src.insuranceExpiry,
          notes: "Added from the HazardLink contractor directory",
        })
        .returning();
      return { contractor: row, existed: false };
    },
  );

  /* ══════════════════ Partner leads (marketing site) ══════════════════ */

  const leadBody = z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(160),
    company: z.string().max(160).optional(),
    phone: z.string().max(40).optional(),
    segment: z.enum(["distributor", "installer", "consultancy", "franchise", "other"]).optional(),
    message: z.string().max(3000).optional(),
  });
  app.post("/public/partner-lead", publicWriteLimit, async (req, reply) => {
    const parsed = leadBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    await db.insert(schema.partnerLeads).values({
      name: b.name, email: b.email, company: b.company ?? null, phone: b.phone ?? null,
      segment: b.segment ?? "other", message: b.message ?? null,
    });
    // Best-effort heads-up to the founder inbox; the row is the source of truth.
    const to = config.LEADS_EMAIL || "owenfitz34@gmail.com";
    void sendEmailToUser(
      to,
      `Partner enquiry: ${b.company || b.name}`,
      [
        `Name:    ${b.name}`,
        `Company: ${b.company ?? "—"}`,
        `Email:   ${b.email}`,
        `Phone:   ${b.phone ?? "—"}`,
        `Segment: ${b.segment ?? "other"}`,
        ``,
        b.message ?? "(no message)",
      ].join("\n"),
    );
    return { ok: true };
  });

  /* ══════════════════ Authed contractor-loop endpoints ══════════════════ */

  app.post(
    "/contractors/:id/claim-invite",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      const [con] = await db
        .select()
        .from(schema.contractors)
        .where(and(eq(schema.contractors.id, id), eq(schema.contractors.organisationId, c.orgId)))
        .limit(1);
      if (!con) return reply.code(404).send({ error: "not_found" });

      let claimToken = con.claimToken;
      if (!claimToken) {
        claimToken = randomBytes(18).toString("base64url");
        await db.update(schema.contractors).set({ claimToken }).where(eq(schema.contractors.id, con.id));
      }
      const url = `${APP_BASE}/contractor/${claimToken}`;

      let emailed = false;
      if (con.email) {
        const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, c.orgId)).limit(1);
        const orgName = org?.name ?? "Your client";
        const send = await sendEmail({
          to: con.email,
          fromName: orgName,
          subject: `Set up your contractor profile for ${orgName}`,
          text: [
            con.contactName ? `Dear ${con.contactName},` : "Dear Sir or Madam,",
            ``,
            `${orgName} uses HazardLink to manage its sites and tender work to contractors.`,
            ``,
            `Set up your free contractor profile at the link below. Upload your insurance and certs once, and they are reused for every job — no more emailing the same documents to every client. You can also list your company in the public HazardLink contractor directory if you want new work to find you.`,
            ``,
            url,
            ``,
            `No login or account is needed — the link is yours.`,
            ``,
            `Kind regards,`,
            orgName,
          ].join("\n"),
        });
        emailed = send.ok;
      }
      return { ok: true, url, emailed };
    },
  );

  app.get(
    "/contractors/:id/documents",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      const [con] = await db
        .select({ id: schema.contractors.id })
        .from(schema.contractors)
        .where(and(eq(schema.contractors.id, id), eq(schema.contractors.organisationId, c.orgId)))
        .limit(1);
      if (!con) return reply.code(404).send({ error: "not_found" });
      const docs = await db.select().from(schema.contractorDocuments).where(eq(schema.contractorDocuments.contractorId, id)).orderBy(desc(schema.contractorDocuments.uploadedAt));
      return { documents: docs.map(serializeDoc) };
    },
  );

  /* ══════════════════ Visitors ══════════════════ */

  app.get("/visitors", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = z.object({
      buildingId: z.string().uuid().optional(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const day = q.data.day ?? new Date().toISOString().slice(0, 10);
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(`${day}T23:59:59.999Z`);
    // A visitor belongs to a day if they were EXPECTED that day, SIGNED IN that
    // day, or (walk-ins with no other anchor) created that day — so a booking
    // made today for Thursday shows on Thursday's sheet, not today's.
    const inRange = (col: any) => and(gte(col, from), lte(col, to));
    const conds = [
      eq(schema.visitors.organisationId, c.orgId),
      or(
        inRange(schema.visitors.expectedAt),
        inRange(schema.visitors.signedInAt),
        inRange(schema.visitors.createdAt),
      )!,
    ];
    if (q.data.buildingId) conds.push(eq(schema.visitors.buildingId, q.data.buildingId));
    const rows = await db.select().from(schema.visitors).where(and(...conds)).orderBy(desc(schema.visitors.createdAt)).limit(500);
    return { visitors: rows };
  });

  const visitorBody = z.object({
    name: z.string().min(1).max(120),
    company: z.string().max(120).optional(),
    host: z.string().max(120).optional(),
    purpose: z.string().max(200).optional(),
    badge: z.string().max(40).optional(),
    buildingId: z.string().uuid().optional(),
    expectedAt: z.string().datetime().optional(),
    signInNow: z.boolean().optional(),
  });
  app.post("/visitors", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = visitorBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;
    const [row] = await db.insert(schema.visitors).values({
      organisationId: c.orgId,
      buildingId: b.buildingId ?? null,
      name: b.name,
      company: b.company ?? null,
      host: b.host ?? null,
      purpose: b.purpose ?? null,
      badge: b.badge ?? null,
      expectedAt: b.expectedAt ? new Date(b.expectedAt) : null,
      signedInAt: b.signInNow ? new Date() : null,
    }).returning();
    if (row) audit(c.orgId, c.sub, b.signInNow ? "visitor.signed_in" : "visitor.expected", "visitor", row.id, { name: row.name });
    return { visitor: row };
  });

  app.post("/visitors/:id/sign-in", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [row] = await db
      .update(schema.visitors)
      .set({ signedInAt: new Date(), signedOutAt: null })
      .where(and(eq(schema.visitors.id, id), eq(schema.visitors.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    audit(c.orgId, c.sub, "visitor.signed_in", "visitor", id, { name: row.name });
    return { visitor: row };
  });

  app.post("/visitors/:id/sign-out", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [row] = await db
      .update(schema.visitors)
      .set({ signedOutAt: new Date() })
      .where(and(eq(schema.visitors.id, id), eq(schema.visitors.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    audit(c.orgId, c.sub, "visitor.signed_out", "visitor", id, { name: row.name });
    return { visitor: row };
  });

  app.delete("/visitors/:id", { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    await db.delete(schema.visitors).where(and(eq(schema.visitors.id, id), eq(schema.visitors.organisationId, c.orgId)));
    return { ok: true };
  });

  /* ══════════════════ Exports — audit pack / invoices CSV / energy CSV ══════════════════ */

  app.get(
    "/reports/audit-pack",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"]), requirePermission("action.export_reports")] },
    async (req, reply) => {
      const q = z.object({
        buildingId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }).safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const to = q.data.to ? new Date(q.data.to) : new Date();
      const from = q.data.from ? new Date(q.data.from) : new Date(to.getTime() - 90 * 24 * 3600 * 1000);
      const html = await buildAuditPack({ orgId: c.orgId, buildingId: q.data.buildingId ?? null, from, to });
      reply.type("text/html; charset=utf-8");
      return html;
    },
  );

  app.get(
    "/invoices/export.csv",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"]), requirePermission("action.manage_billing")] },
    async (req, reply) => {
      const c = ctx(req);
      const rows = await db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.organisationId, c.orgId))
        .orderBy(desc(schema.invoices.createdAt))
        .limit(2000);
      const d = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : "");
      // Xero sales-invoice import column names; Sage accepts the same via mapping.
      const csv = toCsv(
        [
          { header: "ContactName", value: (r: typeof rows[number]) => r.customerName || "Unknown customer" },
          { header: "InvoiceNumber", value: (r) => r.number },
          { header: "InvoiceDate", value: (r) => d(r.issuedAt) },
          { header: "DueDate", value: (r) => d(r.dueAt) },
          { header: "Description", value: (r) => r.notes || "Facilities services" },
          { header: "Quantity", value: () => 1 },
          { header: "UnitAmount", value: (r) => (r.amountCents / 100).toFixed(2) },
          { header: "AccountCode", value: () => "" },
          { header: "TaxType", value: () => "" },
          { header: "Currency", value: (r) => r.currency },
          { header: "Status", value: (r) => r.status },
        ],
        rows,
      );
      reply.type("text/csv; charset=utf-8");
      reply.header("content-disposition", `attachment; filename="${csvFilename("invoices")}"`);
      return csv;
    },
  );

  app.get(
    "/reports/energy.csv",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"]), requirePermission("action.export_reports")] },
    async (req, reply) => {
      const q = z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }).safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const to = q.data.to ? new Date(q.data.to) : new Date();
      const from = q.data.from ? new Date(q.data.from) : new Date(to.getTime() - 365 * 24 * 3600 * 1000);
      const rows = await db
        .select({
          recordedAt: schema.meterReadings.recordedAt,
          value: schema.meterReadings.value,
          note: schema.meterReadings.note,
          meterName: schema.assetMeters.name,
          unit: schema.assetMeters.unit,
          assetName: schema.assets.name,
        })
        .from(schema.meterReadings)
        .innerJoin(schema.assetMeters, eq(schema.meterReadings.meterId, schema.assetMeters.id))
        .innerJoin(schema.assets, eq(schema.assetMeters.assetId, schema.assets.id))
        .where(and(
          eq(schema.meterReadings.organisationId, c.orgId),
          gte(schema.meterReadings.recordedAt, from),
          lte(schema.meterReadings.recordedAt, to),
        ))
        .orderBy(desc(schema.meterReadings.recordedAt))
        .limit(5000);
      const csv = toCsv(
        [
          { header: "RecordedAt", value: (r: typeof rows[number]) => r.recordedAt.toISOString() },
          { header: "Asset", value: (r) => r.assetName },
          { header: "Meter", value: (r) => r.meterName },
          { header: "Unit", value: (r) => r.unit ?? "" },
          { header: "Value", value: (r) => r.value },
          { header: "Note", value: (r) => r.note ?? "" },
        ],
        rows,
      );
      reply.type("text/csv; charset=utf-8");
      reply.header("content-disposition", `attachment; filename="${csvFilename("energy-readings")}"`);
      return csv;
    },
  );

  /* ══════════════════ Integrations settings (Teams webhook) ══════════════════ */

  app.get(
    "/settings/integrations",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req) => {
      const c = ctx(req);
      return await getIntegrationSettings(c.orgId);
    },
  );

  app.put(
    "/settings/integrations",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const parsed = z.object({ teamsWebhookUrl: z.string().url().max(500).nullable() }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await setIntegrationSettings(c.orgId, { teamsWebhookUrl: parsed.data.teamsWebhookUrl });
      return { ok: true };
    },
  );
}
