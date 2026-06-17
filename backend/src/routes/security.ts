import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

// A checkpoint's QR points here — a no-login scan page (reuses the magic-link
// pattern). Guards open it by scanning, confirm, and the scan is logged.
const SCAN_BASE = "https://app.hazardlink.ie";
export function checkpointScanUrl(token: string): string {
  return `${SCAN_BASE}/c/${token}`;
}

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
  photoUrl: z.string().max(500).nullable().optional(),
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
        photoUrl: b.photoUrl || null,
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

  // Turn an incident into a maintenance job (cross-discipline bridge).
  app.post("/incidents/:id/raise-job", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [inc] = await db
      .select()
      .from(schema.securityIncidents)
      .where(and(eq(schema.securityIncidents.id, id), eq(schema.securityIncidents.organisationId, c.orgId)))
      .limit(1);
    if (!inc) return reply.code(404).send({ error: "not_found" });
    if (inc.raisedJobId) return { ok: true, jobId: inc.raisedJobId };

    const priority = inc.severity === "critical" ? "emergency" : inc.severity === "high" ? "urgent" : "routine";
    const [job] = await db
      .insert(schema.maintenanceJobs)
      .values({
        organisationId: c.orgId,
        source: "manual",
        buildingId: inc.buildingId,
        title: `From incident: ${inc.title}`,
        description: `${inc.kind ? inc.kind + " — " : ""}${inc.description ?? ""}\n\n— Raised from a security incident`.trim(),
        priority,
        status: "logged",
      })
      .returning();
    if (!job) return reply.code(500).send({ error: "failed" });
    await db.insert(schema.jobEvents).values({
      organisationId: c.orgId,
      jobId: job.id,
      type: "logged",
      actorUserId: c.sub,
      detail: `Raised from security incident: ${inc.title}`,
    });
    await db.update(schema.securityIncidents).set({ raisedJobId: job.id }).where(eq(schema.securityIncidents.id, inc.id));
    return { ok: true, jobId: job.id };
  });

  // ─── Checkpoints (guard tours) ──────────────────────────────────────────
  const checkpointBody = z.object({
    name: z.string().min(1).max(160),
    buildingId: z.string().uuid().nullable().optional(),
    locationNote: z.string().max(300).nullable().optional(),
    instructions: z.string().max(2000).nullable().optional(),
    discipline: z.enum(["cleaning", "security"]).optional(),
    active: z.boolean().optional(),
  });

  // Cleaning rounds and security patrols share this table; `?discipline=` keeps
  // each section's list separate. Omitted → all (backwards-compatible).
  const disciplineOf = (req: any): "cleaning" | "security" | null => {
    const d = (req.query as { discipline?: string })?.discipline;
    return d === "cleaning" || d === "security" ? d : null;
  };

  app.get("/checkpoints", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const disc = disciplineOf(req);
    const rows = await db
      .select()
      .from(schema.checkpoints)
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.checkpoints.buildingId))
      .where(disc
        ? and(eq(schema.checkpoints.organisationId, c.orgId), eq(schema.checkpoints.discipline, disc))
        : eq(schema.checkpoints.organisationId, c.orgId))
      .orderBy(schema.checkpoints.name);
    return {
      checkpoints: rows.map((r) => ({
        ...r.checkpoints,
        scanUrl: checkpointScanUrl(r.checkpoints.token),
        building: r.buildings?.id ? { id: r.buildings.id, name: r.buildings.name } : null,
      })),
    };
  });

  app.post("/checkpoints", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const parsed = checkpointBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;
    const [row] = await db
      .insert(schema.checkpoints)
      .values({
        organisationId: c.orgId,
        name: b.name.trim(),
        buildingId: b.buildingId ?? null,
        locationNote: b.locationNote?.trim() || null,
        instructions: b.instructions?.trim() || null,
        discipline: b.discipline ?? "security",
        token: randomBytes(18).toString("base64url"),
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert_failed" });
    return reply.code(201).send({ checkpoint: { ...row, scanUrl: checkpointScanUrl(row.token) } });
  });

  app.patch("/checkpoints/:id", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = checkpointBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const b = parsed.data;
    const updates: Record<string, unknown> = {};
    if (b.name !== undefined) updates.name = b.name.trim();
    if (b.buildingId !== undefined) updates.buildingId = b.buildingId || null;
    if (b.locationNote !== undefined) updates.locationNote = b.locationNote?.trim() || null;
    if (b.instructions !== undefined) updates.instructions = b.instructions?.trim() || null;
    if (b.active !== undefined) updates.active = b.active;
    if (Object.keys(updates).length === 0) return { ok: true };
    const [row] = await db
      .update(schema.checkpoints)
      .set(updates)
      .where(and(eq(schema.checkpoints.id, id), eq(schema.checkpoints.organisationId, c.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { checkpoint: { ...row, scanUrl: checkpointScanUrl(row.token) } };
  });

  // Recent scans (newest first), joined to checkpoint + building. `?discipline=`
  // scopes to cleaning rounds or security patrols; photoUrl is the proof photo.
  app.get("/checkpoint-scans", { preHandler: [app.authenticate, staff] }, async (req) => {
    const c = ctx(req);
    const disc = disciplineOf(req);
    const rows = await db
      .select({
        id: schema.checkpointScans.id,
        checkpointId: schema.checkpointScans.checkpointId,
        guardName: schema.checkpointScans.guardName,
        note: schema.checkpointScans.note,
        photoUrl: schema.checkpointScans.photoUrl,
        flagged: schema.checkpointScans.flagged,
        scannedAt: schema.checkpointScans.scannedAt,
        checkpointName: schema.checkpoints.name,
        buildingName: schema.buildings.name,
      })
      .from(schema.checkpointScans)
      .leftJoin(schema.checkpoints, eq(schema.checkpoints.id, schema.checkpointScans.checkpointId))
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.checkpoints.buildingId))
      .where(disc
        ? and(eq(schema.checkpointScans.organisationId, c.orgId), eq(schema.checkpoints.discipline, disc))
        : eq(schema.checkpointScans.organisationId, c.orgId))
      .orderBy(desc(schema.checkpointScans.scannedAt))
      .limit(100);
    return { scans: rows };
  });
}
