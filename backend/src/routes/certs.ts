/**
 * Staff certifications (competency) — SafePass, Manual Handling, First Aid…
 * Status derived from expires_on: expired / expiring (≤60 days) / valid.
 *
 *   GET    /certs?userId          staff: whole org (optionally one person);
 *                                 field staff: own certs only
 *   POST   /certs                 add (staff)
 *   PATCH  /certs/:id             edit (staff)
 *   DELETE /certs/:id             remove (staff)
 *   POST   /certs/:id/document    attach the cert PDF/photo (staff)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { uploadCertDoc } from "../services/storage.js";

const requireStaff = async (req: any, reply: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OK_DOC_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function statusOf(expiresOn: string | null): "expired" | "expiring" | "valid" | "no_expiry" {
  if (!expiresOn) return "no_expiry";
  const today = new Date().toISOString().slice(0, 10);
  if (expiresOn < today) return "expired";
  const soon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  return expiresOn <= soon ? "expiring" : "valid";
}

export default async function certRoutes(app: FastifyInstance): Promise<void> {
  app.get("/certs", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = z.object({ userId: z.string().uuid().optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const role = (req as any).user?.role as string;
    const isStaff = role === "admin" || role === "supervisor";
    const conds = [eq(schema.staffCerts.organisationId, c.orgId)];
    if (!isStaff) conds.push(eq(schema.staffCerts.userId, c.sub));
    else if (q.data.userId) conds.push(eq(schema.staffCerts.userId, q.data.userId));
    const rows = await db
      .select({ cert: schema.staffCerts, userName: schema.users.name, userRole: schema.users.role })
      .from(schema.staffCerts)
      .innerJoin(schema.users, eq(schema.staffCerts.userId, schema.users.id))
      .where(and(...conds))
      .orderBy(schema.staffCerts.expiresOn)
      .limit(1000);
    return {
      certs: rows.map((r) => ({
        ...r.cert,
        userName: r.userName,
        userRole: r.userRole,
        status: statusOf(r.cert.expiresOn),
      })),
    };
  });

  const createBody = z.object({
    userId: z.string().uuid(),
    name: z.string().min(1).max(200),
    issuer: z.string().max(200).nullish(),
    certNo: z.string().max(100).nullish(),
    issuedOn: z.string().regex(DATE_RE).nullish(),
    expiresOn: z.string().regex(DATE_RE).nullish(),
  });
  app.post("/certs", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const c = ctx(req);
    const [target] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.id, b.userId), eq(schema.users.organisationId, c.orgId))).limit(1);
    if (!target) return reply.code(404).send({ error: "not_found" });
    const [row] = await db.insert(schema.staffCerts).values({
      organisationId: c.orgId,
      userId: b.userId,
      name: b.name,
      issuer: b.issuer ?? null,
      certNo: b.certNo ?? null,
      issuedOn: b.issuedOn ?? null,
      expiresOn: b.expiresOn ?? null,
      createdBy: c.sub,
    }).returning();
    return { cert: { ...row, status: statusOf(row!.expiresOn) } };
  });

  const patchBody = createBody.partial().omit({ userId: true });
  app.patch("/certs/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const b = parsed.data;
    const c = ctx(req);
    const [row] = await db.update(schema.staffCerts)
      .set({
        ...(b.name != null ? { name: b.name } : {}),
        ...(b.issuer !== undefined ? { issuer: b.issuer } : {}),
        ...(b.certNo !== undefined ? { certNo: b.certNo } : {}),
        ...(b.issuedOn !== undefined ? { issuedOn: b.issuedOn } : {}),
        ...(b.expiresOn !== undefined ? { expiresOn: b.expiresOn } : {}),
      })
      .where(and(eq(schema.staffCerts.id, id), eq(schema.staffCerts.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { cert: { ...row, status: statusOf(row.expiresOn) } };
  });

  app.delete("/certs/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const rows = await db.delete(schema.staffCerts)
      .where(and(eq(schema.staffCerts.id, id), eq(schema.staffCerts.organisationId, c.orgId)))
      .returning({ id: schema.staffCerts.id });
    if (!rows.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/certs/:id/document", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [existing] = await db.select({ id: schema.staffCerts.id }).from(schema.staffCerts)
      .where(and(eq(schema.staffCerts.id, id), eq(schema.staffCerts.organisationId, c.orgId))).limit(1);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (!OK_DOC_MIMES.includes(file.mimetype)) return reply.code(400).send({ error: "unsupported_type" });
    const buf = await file.toBuffer();
    const { url } = await uploadCertDoc({
      filename: file.filename || "cert.pdf",
      mimetype: file.mimetype || "application/pdf",
      body: buf,
    });
    const [row] = await db.update(schema.staffCerts)
      .set({ documentUrl: url })
      .where(eq(schema.staffCerts.id, id))
      .returning();
    return { cert: { ...row, status: statusOf(row!.expiresOn) } };
  });
}
