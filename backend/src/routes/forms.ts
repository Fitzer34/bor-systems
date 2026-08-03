/**
 * Forms — org-defined templates + submissions.
 *
 *   GET    /forms                       templates + submission counts
 *   POST   /forms                       create template (staff)
 *   PATCH  /forms/:id                   edit template (staff)
 *   DELETE /forms/:id                   archive (has submissions) or delete
 *   GET    /forms/:id/submissions       rows, newest first
 *   POST   /forms/:id/submissions       submit (any signed-in user)
 *   GET    /forms/:id/submissions.csv   export (staff)
 *
 * Template fields: [{id, label, type, required, options?}] where type is
 * text|textarea|number|select|checkbox|date. Answers: {fieldId: value}.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireStaff = async (req: any, reply: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
};

const FIELD_TYPES = ["text", "textarea", "number", "select", "checkbox", "date"] as const;

const fieldSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().max(120)).max(30).optional(),
});
type Field = z.infer<typeof fieldSchema>;

function csvCell(v: unknown): string {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function formRoutes(app: FastifyInstance): Promise<void> {
  app.get("/forms", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const templates = await db.select().from(schema.formTemplates)
      .where(eq(schema.formTemplates.organisationId, c.orgId))
      .orderBy(desc(schema.formTemplates.createdAt))
      .limit(200);
    const counts = await db
      .select({
        templateId: schema.formSubmissions.templateId,
        n: sql<number>`count(*)::int`,
        last: sql<string | null>`max(${schema.formSubmissions.createdAt})`,
      })
      .from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.organisationId, c.orgId))
      .groupBy(schema.formSubmissions.templateId);
    const byTpl = new Map(counts.map((r) => [r.templateId, r]));
    return {
      forms: templates.map((t) => ({
        ...t,
        submissionCount: byTpl.get(t.id)?.n ?? 0,
        lastSubmissionAt: byTpl.get(t.id)?.last ?? null,
      })),
    };
  });

  const createBody = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).nullish(),
    fields: z.array(fieldSchema).min(1).max(60),
  });
  app.post("/forms", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const ids = new Set(b.fields.map((f) => f.id));
    if (ids.size !== b.fields.length) return reply.code(400).send({ error: "duplicate_field_ids" });
    const c = ctx(req);
    const [row] = await db.insert(schema.formTemplates).values({
      organisationId: c.orgId,
      name: b.name,
      description: b.description ?? null,
      fields: b.fields,
      createdBy: c.sub,
    }).returning();
    return { form: { ...row, submissionCount: 0, lastSubmissionAt: null } };
  });

  const patchBody = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullish(),
    fields: z.array(fieldSchema).min(1).max(60).optional(),
    active: z.boolean().optional(),
  });
  app.patch("/forms/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const b = parsed.data;
    if (b.fields) {
      const ids = new Set(b.fields.map((f) => f.id));
      if (ids.size !== b.fields.length) return reply.code(400).send({ error: "duplicate_field_ids" });
    }
    const c = ctx(req);
    const [row] = await db.update(schema.formTemplates)
      .set({
        ...(b.name != null ? { name: b.name } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.fields ? { fields: b.fields } : {}),
        ...(b.active != null ? { active: b.active } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.formTemplates.id, id), eq(schema.formTemplates.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { form: row };
  });

  app.delete("/forms/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [tpl] = await db.select({ id: schema.formTemplates.id }).from(schema.formTemplates)
      .where(and(eq(schema.formTemplates.id, id), eq(schema.formTemplates.organisationId, c.orgId))).limit(1);
    if (!tpl) return reply.code(404).send({ error: "not_found" });
    const cnt = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.templateId, id));
    const n = cnt[0]?.n ?? 0;
    if (n > 0) {
      // Keep the history: archive instead of destroying submissions.
      await db.update(schema.formTemplates).set({ active: false, updatedAt: new Date() })
        .where(eq(schema.formTemplates.id, id));
      return { ok: true, archived: true };
    }
    await db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, id));
    return { ok: true, archived: false };
  });

  app.get("/forms/:id/submissions", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [tpl] = await db.select().from(schema.formTemplates)
      .where(and(eq(schema.formTemplates.id, id), eq(schema.formTemplates.organisationId, c.orgId))).limit(1);
    if (!tpl) return reply.code(404).send({ error: "not_found" });
    const rows = await db
      .select({
        sub: schema.formSubmissions,
        submitterName: schema.users.name,
        buildingName: schema.buildings.name,
      })
      .from(schema.formSubmissions)
      .leftJoin(schema.users, eq(schema.formSubmissions.submittedBy, schema.users.id))
      .leftJoin(schema.buildings, eq(schema.formSubmissions.buildingId, schema.buildings.id))
      .where(eq(schema.formSubmissions.templateId, id))
      .orderBy(desc(schema.formSubmissions.createdAt))
      .limit(500);
    return {
      form: tpl,
      submissions: rows.map((r) => ({
        ...r.sub,
        submitterName: r.submitterName,
        buildingName: r.buildingName,
      })),
    };
  });

  app.post("/forms/:id/submissions", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = z.object({
      answers: z.record(z.string(), z.any()),
      buildingId: z.string().uuid().nullish(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [tpl] = await db.select().from(schema.formTemplates)
      .where(and(eq(schema.formTemplates.id, id), eq(schema.formTemplates.organisationId, c.orgId))).limit(1);
    if (!tpl) return reply.code(404).send({ error: "not_found" });
    if (!tpl.active) return reply.code(409).send({ error: "form_archived" });
    const fields = (tpl.fields as Field[]) || [];
    for (const f of fields) {
      const v = (parsed.data.answers as Record<string, unknown>)[f.id];
      if (f.required && (v == null || v === "" || v === false)) {
        return reply.code(400).send({ error: "missing_required", fieldId: f.id, fieldLabel: f.label });
      }
    }
    const [row] = await db.insert(schema.formSubmissions).values({
      organisationId: c.orgId,
      templateId: id,
      buildingId: parsed.data.buildingId ?? null,
      submittedBy: c.sub,
      answers: parsed.data.answers,
    }).returning();
    return { submission: row };
  });

  app.get("/forms/:id/submissions.csv", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [tpl] = await db.select().from(schema.formTemplates)
      .where(and(eq(schema.formTemplates.id, id), eq(schema.formTemplates.organisationId, c.orgId))).limit(1);
    if (!tpl) return reply.code(404).send({ error: "not_found" });
    const fields = (tpl.fields as Field[]) || [];
    const rows = await db
      .select({
        sub: schema.formSubmissions,
        submitterName: schema.users.name,
        buildingName: schema.buildings.name,
      })
      .from(schema.formSubmissions)
      .leftJoin(schema.users, eq(schema.formSubmissions.submittedBy, schema.users.id))
      .leftJoin(schema.buildings, eq(schema.formSubmissions.buildingId, schema.buildings.id))
      .where(eq(schema.formSubmissions.templateId, id))
      .orderBy(desc(schema.formSubmissions.createdAt))
      .limit(2000);
    const header = ["Submitted", "By", "Site", ...fields.map((f) => f.label)];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      const a = (r.sub.answers as Record<string, unknown>) || {};
      lines.push([
        r.sub.createdAt.toISOString(),
        r.submitterName || "",
        r.buildingName || "",
        ...fields.map((f) => a[f.id]),
      ].map(csvCell).join(","));
    }
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="form-${id.slice(0, 8)}.csv"`);
    return lines.join("\n") + "\n";
  });
}
