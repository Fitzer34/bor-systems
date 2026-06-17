import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

/**
 * Security section routes. First feature: incident reporting — guards/staff log
 * incidents on site (intruder, theft, damage, safety hazard…), tied to a
 * building so it shares the site model with cleaning + maintenance.
 */

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const incidentBody = z.object({
  title: z.string().min(1).max(200),
  kind: z.string().max(80).nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  buildingId: z.string().uuid().nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});

export default async function securityRoutes(app: FastifyInstance): Promise<void> {
  const staff = requireRole(["admin", "supervisor"]);

  // List incidents (newest first) with the building name attached.
  app.get("/incidents", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.securityIncidents)
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.securityIncidents.buildingId))
      .where(eq(schema.securityIncidents.organisationId, c.orgId))
      .orderBy(desc(schema.securityIncidents.createdAt));
    return {
      incidents: rows.map((r) => ({
        ...r.security_incidents,
        building: r.buildings?.id ? { id: r.buildings.id, name: r.buildings.name } : null,
      })),
    };
  });

  // Log a new incident.
  app.post("/incidents", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = incidentBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    const c = ctx(req);
    const b = parsed.data;
    const [row] = await db
      .insert(schema.securityIncidents)
      .values({
        organisationId: c.orgId,
        reportedByUserId: c.sub,
        title: b.title.trim(),
        kind: b.kind?.trim() || null,
        severity: b.severity ?? "medium",
        buildingId: b.buildingId ?? null,
        description: b.description?.trim() || null,
        occurredAt: b.occurredAt ? new Date(b.occurredAt) : null,
      })
      .returning();
    return reply.code(201).send({ incident: row });
  });

  // Update / resolve an incident.
  app.patch("/incidents/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = incidentBody
      .partial()
      .extend({
        status: z.enum(["open", "investigating", "resolved"]).optional(),
        resolutionNote: z.string().max(2000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;

    const updates: Record<string, unknown> = {};
    if (b.title !== undefined) updates.title = b.title.trim();
    if (b.kind !== undefined) updates.kind = b.kind?.trim() || null;
    if (b.severity !== undefined) updates.severity = b.severity;
    if (b.buildingId !== undefined) updates.buildingId = b.buildingId || null;
    if (b.description !== undefined) updates.description = b.description?.trim() || null;
    if (b.occurredAt !== undefined) updates.occurredAt = b.occurredAt ? new Date(b.occurredAt) : null;
    if (b.resolutionNote !== undefined) updates.resolutionNote = b.resolutionNote?.trim() || null;
    if (b.status !== undefined) {
      updates.status = b.status;
      // Stamp/clear the resolved time as status moves in and out of "resolved".
      updates.resolvedAt = b.status === "resolved" ? new Date() : null;
    }
    if (Object.keys(updates).length === 0) return { ok: true };

    const [row] = await db
      .update(schema.securityIncidents)
      .set(updates)
      .where(and(eq(schema.securityIncidents.id, id), eq(schema.securityIncidents.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { incident: row };
  });
}
