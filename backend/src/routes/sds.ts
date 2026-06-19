import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { uploadSds } from "../services/storage.js";
import { extractSdsFromDocument, isAiConfigured } from "../services/ai.js";
import { lookupProductIdentity, lookupSdsByBarcode, sdsProviderConfigured } from "../services/sds-provider.js";

/**
 * Safety Data Sheets (SDS). A per-org chemical library, filed by discipline
 * (cleaning / maintenance / security / general) and found by scanning a product
 * barcode.
 *
 * Reading is open to any signed-in worker (field staff must be able to pull up an
 * SDS at the point of use). Authoring — extracting, creating, editing, verifying
 * and deleting — is staff-only.
 *
 * The "both" data flow on a scan: org library → paid provider (if configured) →
 * free product-identity lookup. Hazards and ingredients are only ever read from
 * the uploaded sheet by the grounded extractor and confirmed by a person; nothing
 * is invented.
 */

const DISCIPLINES = ["cleaning", "maintenance", "security", "general"] as const;
const EXTRACT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const staff: Array<typeof schema.userRole.enumValues[number]> = ["admin", "supervisor"];

const stmt = z.object({ code: z.string().max(20), text: z.string().max(400) });
const ingredient = z.object({ name: z.string().max(200), cas: z.string().max(40), percent: z.string().max(40) });

const upsertBody = z.object({
  discipline: z.enum(DISCIPLINES).default("general"),
  barcode: z.string().max(64).nullable().optional(),
  buildingId: z.string().uuid().nullable().optional(),
  productName: z.string().min(1).max(200),
  manufacturer: z.string().max(200).nullable().optional(),
  productCode: z.string().max(120).nullable().optional(),
  signalWord: z.string().max(40).nullable().optional(),
  pictograms: z.array(z.string().max(40)).max(20).optional(),
  hazardStatements: z.array(stmt).max(60).optional(),
  precautionaryStatements: z.array(stmt).max(80).optional(),
  ingredients: z.array(ingredient).max(80).optional(),
  firstAid: z.string().max(4000).nullable().optional(),
  storageHandling: z.string().max(4000).nullable().optional(),
  ppe: z.string().max(2000).nullable().optional(),
  sdsPdfUrl: z.string().max(600).nullable().optional(),
  issueDate: z.string().max(10).nullable().optional(),
  revisionDate: z.string().max(10).nullable().optional(),
  reviewDate: z.string().max(10).nullable().optional(),
  source: z.enum(["ai_extraction", "manual", "provider"]).optional(),
  extractionWarnings: z.array(z.string().max(400)).max(60).optional(),
  verified: z.boolean().optional(),
});

const patchBody = upsertBody.partial();

const isoDate = (s?: string | null): string | null =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;

const clean = (s?: string | null): string | null => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

export default async function sdsRoutes(app: FastifyInstance): Promise<void> {
  // List the org's SDS library, newest first. Optional ?discipline= and ?q= filters.
  app.get("/sds", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const q = req.query as { discipline?: string; q?: string };
    const filters = [eq(schema.sdsSheets.organisationId, c.orgId)];
    if (q.discipline && (DISCIPLINES as readonly string[]).includes(q.discipline)) {
      filters.push(eq(schema.sdsSheets.discipline, q.discipline as (typeof DISCIPLINES)[number]));
    }
    const term = q.q?.trim();
    if (term) {
      const like = `%${term}%`;
      const m = or(
        ilike(schema.sdsSheets.productName, like),
        ilike(schema.sdsSheets.manufacturer, like),
        ilike(schema.sdsSheets.barcode, like),
      );
      if (m) filters.push(m);
    }
    const rows = await db
      .select()
      .from(schema.sdsSheets)
      .where(and(...filters))
      .orderBy(desc(schema.sdsSheets.createdAt))
      .limit(500);
    return { sheets: rows };
  });

  // One SDS record.
  app.get("/sds/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [row] = await db
      .select()
      .from(schema.sdsSheets)
      .where(and(eq(schema.sdsSheets.id, id), eq(schema.sdsSheets.organisationId, c.orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { sheet: row };
  });

  // Barcode scan resolver: library first, then paid provider, then free identity.
  app.get("/sds/lookup", { preHandler: [app.authenticate] }, async (req, reply) => {
    const c = ctx(req);
    const barcode = ((req.query as { barcode?: string }).barcode || "").trim();
    if (!barcode) return reply.code(400).send({ error: "missing_barcode" });

    const [existing] = await db
      .select()
      .from(schema.sdsSheets)
      .where(and(eq(schema.sdsSheets.organisationId, c.orgId), eq(schema.sdsSheets.barcode, barcode)))
      .limit(1);
    if (existing) return { found: true, sheet: existing, providerConfigured: sdsProviderConfigured() };

    const provider = await lookupSdsByBarcode(barcode);
    if (provider) return { found: false, source: "provider", provider, providerConfigured: true };

    const identity = await lookupProductIdentity(barcode);
    return {
      found: false,
      source: identity ? "identity" : "none",
      identity: identity ?? null,
      providerConfigured: sdsProviderConfigured(),
    };
  });

  // Upload an SDS document (PDF or photo) and read its fields — strictly from the
  // document. Returns the stored URL + the extracted draft for the user to confirm;
  // it does NOT save a record. Staff only.
  app.post("/sds/extract", { preHandler: [app.authenticate, requireRole(staff)] }, async (req, reply) => {
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    const mimetype: string = file.mimetype || "application/octet-stream";
    if (!EXTRACT_TYPES.includes(mimetype)) {
      return reply.code(415).send({ error: "must_be_pdf_or_image" });
    }
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: "too_large" });
    }

    const isPdf = mimetype === "application/pdf";
    const { url } = await uploadSds({
      filename: file.filename || (isPdf ? "sds.pdf" : "sds.jpg"),
      mimetype,
      body: buf,
    });

    if (!isAiConfigured()) {
      return { sdsPdfUrl: url, aiConfigured: false, extracted: null };
    }
    try {
      const extracted = await extractSdsFromDocument({
        media: { kind: isPdf ? "pdf" : "image", base64: buf.toString("base64"), mimeType: mimetype },
      });
      return { sdsPdfUrl: url, aiConfigured: true, extracted };
    } catch (e) {
      req.log.error(e, "sds extraction failed");
      return { sdsPdfUrl: url, aiConfigured: true, extracted: null, error: "extraction_failed" };
    }
  });

  // Create an SDS record (after the user has reviewed any extracted fields). Staff only.
  app.post("/sds", { preHandler: [app.authenticate, requireRole(staff)] }, async (req, reply) => {
    const parsed = upsertBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;
    const barcode = clean(b.barcode);

    if (barcode) {
      const [dupe] = await db
        .select({ id: schema.sdsSheets.id })
        .from(schema.sdsSheets)
        .where(and(eq(schema.sdsSheets.organisationId, c.orgId), eq(schema.sdsSheets.barcode, barcode)))
        .limit(1);
      if (dupe) return reply.code(409).send({ error: "barcode_exists", id: dupe.id });
    }

    const source = b.source ?? "manual";
    const verified = b.verified ?? source === "manual";
    const [row] = await db
      .insert(schema.sdsSheets)
      .values({
        organisationId: c.orgId,
        discipline: b.discipline,
        buildingId: b.buildingId ?? null,
        barcode,
        productName: b.productName.trim(),
        manufacturer: clean(b.manufacturer),
        productCode: clean(b.productCode),
        signalWord: clean(b.signalWord),
        pictograms: b.pictograms ?? [],
        hazardStatements: b.hazardStatements ?? [],
        precautionaryStatements: b.precautionaryStatements ?? [],
        ingredients: b.ingredients ?? [],
        firstAid: clean(b.firstAid),
        storageHandling: clean(b.storageHandling),
        ppe: clean(b.ppe),
        sdsPdfUrl: clean(b.sdsPdfUrl),
        issueDate: isoDate(b.issueDate),
        revisionDate: isoDate(b.revisionDate),
        reviewDate: isoDate(b.reviewDate),
        source,
        extractionWarnings: b.extractionWarnings ?? [],
        verified,
        verifiedByUserId: verified ? c.sub : null,
        verifiedAt: verified ? new Date() : null,
        createdByUserId: c.sub,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "failed" });
    return reply.code(201).send({ sheet: row });
  });

  // Edit an SDS record. Staff only.
  app.patch("/sds/:id", { preHandler: [app.authenticate, requireRole(staff)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [row] = await db
      .select()
      .from(schema.sdsSheets)
      .where(and(eq(schema.sdsSheets.id, id), eq(schema.sdsSheets.organisationId, c.orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const b = parsed.data;

    const set: Partial<typeof schema.sdsSheets.$inferInsert> = { updatedAt: new Date() };
    if (b.discipline !== undefined) set.discipline = b.discipline;
    if (b.buildingId !== undefined) set.buildingId = b.buildingId ?? null;
    if (b.barcode !== undefined) set.barcode = clean(b.barcode);
    if (b.productName !== undefined) set.productName = b.productName.trim();
    if (b.manufacturer !== undefined) set.manufacturer = clean(b.manufacturer);
    if (b.productCode !== undefined) set.productCode = clean(b.productCode);
    if (b.signalWord !== undefined) set.signalWord = clean(b.signalWord);
    if (b.pictograms !== undefined) set.pictograms = b.pictograms;
    if (b.hazardStatements !== undefined) set.hazardStatements = b.hazardStatements;
    if (b.precautionaryStatements !== undefined) set.precautionaryStatements = b.precautionaryStatements;
    if (b.ingredients !== undefined) set.ingredients = b.ingredients;
    if (b.firstAid !== undefined) set.firstAid = clean(b.firstAid);
    if (b.storageHandling !== undefined) set.storageHandling = clean(b.storageHandling);
    if (b.ppe !== undefined) set.ppe = clean(b.ppe);
    if (b.sdsPdfUrl !== undefined) set.sdsPdfUrl = clean(b.sdsPdfUrl);
    if (b.issueDate !== undefined) set.issueDate = isoDate(b.issueDate);
    if (b.revisionDate !== undefined) set.revisionDate = isoDate(b.revisionDate);
    if (b.reviewDate !== undefined) set.reviewDate = isoDate(b.reviewDate);
    if (b.extractionWarnings !== undefined) set.extractionWarnings = b.extractionWarnings;
    if (b.verified !== undefined) {
      set.verified = b.verified;
      set.verifiedByUserId = b.verified ? c.sub : null;
      set.verifiedAt = b.verified ? new Date() : null;
    }

    const [updated] = await db
      .update(schema.sdsSheets)
      .set(set)
      .where(and(eq(schema.sdsSheets.id, id), eq(schema.sdsSheets.organisationId, c.orgId)))
      .returning();
    return { sheet: updated };
  });

  // Confirm an AI-extracted / provider record as checked-and-correct. Staff only.
  app.post("/sds/:id/verify", { preHandler: [app.authenticate, requireRole(staff)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [updated] = await db
      .update(schema.sdsSheets)
      .set({ verified: true, verifiedByUserId: c.sub, verifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.sdsSheets.id, id), eq(schema.sdsSheets.organisationId, c.orgId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { sheet: updated };
  });

  // Remove an SDS record. Staff only.
  app.delete("/sds/:id", { preHandler: [app.authenticate, requireRole(staff)] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [deleted] = await db
      .delete(schema.sdsSheets)
      .where(and(eq(schema.sdsSheets.id, id), eq(schema.sdsSheets.organisationId, c.orgId)))
      .returning({ id: schema.sdsSheets.id });
    if (!deleted) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
