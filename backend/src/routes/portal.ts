/**
 * Client portals — a no-login, read-only window for a client into their
 * building, plus a "raise a request" form that logs a real maintenance job.
 *
 * Admin (signed in):
 *   GET    /portals              list portal links + building names
 *   POST   /portals              { buildingId, clientName, email? } → link
 *   DELETE /portals/:id          revoke (link stops working; row kept)
 *
 * Public (token, rate-limited):
 *   GET    /public/portal/:token           site summary: open + recent jobs,
 *                                          compliance counts, PPMs due soon
 *   POST   /public/portal/:token/request   { title, details?, priority? } →
 *                                          creates a job (source 'portal')
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { notifyOrgRole } from "../services/notification-centre.js";

const requireStaff = async (req: any, reply: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
};

const publicWriteLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
const publicReadLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

async function portalByToken(token: string) {
  if (!token || token.length < 20) return null;
  const [row] = await db
    .select({ portal: schema.clientPortals, buildingName: schema.buildings.name })
    .from(schema.clientPortals)
    .innerJoin(schema.buildings, eq(schema.clientPortals.buildingId, schema.buildings.id))
    .where(eq(schema.clientPortals.token, token))
    .limit(1);
  if (!row || row.portal.revokedAt) return null;
  return row;
}

export default async function portalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/portals", { preHandler: [app.authenticate, requireStaff] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select({ portal: schema.clientPortals, buildingName: schema.buildings.name })
      .from(schema.clientPortals)
      .innerJoin(schema.buildings, eq(schema.clientPortals.buildingId, schema.buildings.id))
      .where(eq(schema.clientPortals.organisationId, c.orgId))
      .orderBy(desc(schema.clientPortals.createdAt))
      .limit(200);
    return {
      portals: rows.map((r) => ({
        ...r.portal,
        buildingName: r.buildingName,
        path: `/portal/${r.portal.token}`,
        active: !r.portal.revokedAt,
      })),
    };
  });

  const createBody = z.object({
    buildingId: z.string().uuid(),
    clientName: z.string().min(1).max(200),
    email: z.string().email().max(200).nullish(),
  });
  app.post("/portals", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const c = ctx(req);
    const [building] = await db.select({ id: schema.buildings.id }).from(schema.buildings)
      .where(and(eq(schema.buildings.id, b.buildingId), eq(schema.buildings.organisationId, c.orgId))).limit(1);
    if (!building) return reply.code(404).send({ error: "building_not_found" });
    const token = randomBytes(24).toString("base64url");
    const [row] = await db.insert(schema.clientPortals).values({
      organisationId: c.orgId,
      buildingId: b.buildingId,
      clientName: b.clientName,
      email: b.email ?? null,
      token,
      createdBy: c.sub,
    }).returning();
    return { portal: { ...row, path: `/portal/${token}`, active: true } };
  });

  app.delete("/portals/:id", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [row] = await db.update(schema.clientPortals)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.clientPortals.id, id), eq(schema.clientPortals.organisationId, c.orgId)))
      .returning({ id: schema.clientPortals.id });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  /* ── Public, token-gated ─────────────────────────────────────────── */

  app.get("/public/portal/:token", publicReadLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await portalByToken(token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const p = found.portal;

    const [org] = await db
      .select({ name: schema.organisations.name })
      .from(schema.organisations)
      .where(eq(schema.organisations.id, p.organisationId))
      .limit(1);

    const jobs = await db
      .select({
        id: schema.maintenanceJobs.id,
        title: schema.maintenanceJobs.title,
        status: schema.maintenanceJobs.status,
        priority: schema.maintenanceJobs.priority,
        createdAt: schema.maintenanceJobs.createdAt,
        completedAt: schema.maintenanceJobs.completedAt,
      })
      .from(schema.maintenanceJobs)
      .where(and(
        eq(schema.maintenanceJobs.organisationId, p.organisationId),
        eq(schema.maintenanceJobs.buildingId, p.buildingId),
      ))
      .orderBy(desc(schema.maintenanceJobs.createdAt))
      .limit(100);
    const open = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
    const recentDone = jobs.filter((j) => j.completedAt).slice(0, 10);

    // Compliance for this building + org-wide (NULL building) items.
    const items = await db
      .select({ nextDueOn: schema.complianceItems.nextDueOn })
      .from(schema.complianceItems)
      .where(and(
        eq(schema.complianceItems.organisationId, p.organisationId),
        or(eq(schema.complianceItems.buildingId, p.buildingId), isNull(schema.complianceItems.buildingId)),
      ))
      .limit(500);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const compliance = { ok: 0, dueSoon: 0, overdue: 0 };
    for (const i of items) {
      if (!i.nextDueOn) continue;
      if (i.nextDueOn < today) compliance.overdue += 1;
      else if (i.nextDueOn <= soon) compliance.dueSoon += 1;
      else compliance.ok += 1;
    }

    const ppmsDue = await db
      .select({ id: schema.ppms.id, title: schema.ppms.title, nextDueDate: schema.ppms.nextDueDate })
      .from(schema.ppms)
      .where(and(
        eq(schema.ppms.organisationId, p.organisationId),
        eq(schema.ppms.buildingId, p.buildingId),
        eq(schema.ppms.active, true),
        gte(schema.ppms.nextDueDate, today),
      ))
      .orderBy(schema.ppms.nextDueDate)
      .limit(10);

    return {
      portal: { clientName: p.clientName, buildingName: found.buildingName, orgName: org?.name || "HazardLink" },
      openJobs: open.map((j) => ({
        id: j.id, title: j.title, status: j.status, priority: j.priority, createdAt: j.createdAt,
      })),
      recentCompleted: recentDone.map((j) => ({
        id: j.id, title: j.title, completedAt: j.completedAt,
      })),
      compliance,
      upcomingPpms: ppmsDue.filter((x) => x.nextDueDate <= soon),
    };
  });

  const requestBody = z.object({
    title: z.string().min(3).max(200),
    details: z.string().max(2000).nullish(),
    priority: z.enum(["routine", "urgent"]).default("routine"),
  });
  app.post("/public/portal/:token/request", publicWriteLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const found = await portalByToken(token);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const parsed = requestBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const p = found.portal;

    const [job] = await db.insert(schema.maintenanceJobs).values({
      organisationId: p.organisationId,
      source: "portal",
      buildingId: p.buildingId,
      title: b.title,
      description: b.details ? `${b.details}\n\n(Raised by ${p.clientName} via client portal)` : `Raised by ${p.clientName} via client portal`,
      priority: b.priority,
      status: "logged",
    }).returning();
    await db.insert(schema.jobEvents).values({
      organisationId: p.organisationId,
      jobId: job!.id,
      type: "logged",
      detail: `Raised by client "${p.clientName}" via portal`,
    });
    try {
      await notifyOrgRole(p.organisationId, ["admin", "supervisor"], {
        type: "portal.request",
        title: "Client request from the portal",
        body: `${p.clientName} (${found.buildingName}): ${b.title}`,
        entityType: "job",
        entityId: job!.id,
      });
    } catch { /* non-blocking */ }
    return { ok: true, jobId: job!.id };
  });
}
