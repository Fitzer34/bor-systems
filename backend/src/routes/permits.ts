/**
 * Permits to work — hot works, working at height, confined space, etc.
 *
 *   GET   /permits?status        org's permits, newest first
 *   POST  /permits               request a permit (any signed-in user)
 *   PATCH /permits/:id           { action: approve|reject|activate|close|cancel }
 *                                or field edits while still 'requested'
 *
 * Lifecycle: requested → approved → active → closed, with rejected/cancelled
 * side exits. Approving/rejecting is staff-only; the requester (or staff) can
 * cancel; anyone signed in can mark an approved permit active when work starts.
 * New requests notify admins+supervisors; decisions notify the requester.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { visibleSiteIds, scopeRows } from "../services/site-membership.js";
import { createNotification, notifyOrgRole } from "../services/notification-centre.js";

const PERMIT_TYPES = ["hot_works", "working_at_height", "confined_space", "electrical", "asbestos", "excavation", "general"] as const;
const STATUSES = ["requested", "approved", "active", "closed", "rejected", "cancelled"] as const;

const TYPE_LABEL: Record<string, string> = {
  hot_works: "Hot works",
  working_at_height: "Working at height",
  confined_space: "Confined space",
  electrical: "Electrical",
  asbestos: "Asbestos",
  excavation: "Excavation",
  general: "General",
};

export default async function permitRoutes(app: FastifyInstance): Promise<void> {
  app.get("/permits", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = z.object({ status: z.enum(STATUSES).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const conds = [eq(schema.permits.organisationId, c.orgId)];
    if (q.data.status) conds.push(eq(schema.permits.status, q.data.status));
    const rows = await db
      .select({
        permit: schema.permits,
        buildingName: schema.buildings.name,
        requestedByName: schema.users.name,
      })
      .from(schema.permits)
      .leftJoin(schema.buildings, eq(schema.permits.buildingId, schema.buildings.id))
      .leftJoin(schema.users, eq(schema.permits.requestedBy, schema.users.id))
      .where(and(...conds))
      .orderBy(desc(schema.permits.createdAt))
      .limit(500);
    const scope = await visibleSiteIds(c.orgId, c.sub, c.role);
    return {
      permits: scopeRows(rows.map((r) => ({
        ...r.permit,
        buildingName: r.buildingName,
        requestedByName: r.requestedByName,
        typeLabel: TYPE_LABEL[r.permit.type] || r.permit.type,
      })), scope),
    };
  });

  const createBody = z.object({
    type: z.enum(PERMIT_TYPES).default("general"),
    description: z.string().min(1).max(2000),
    buildingId: z.string().uuid().nullish(),
    jobId: z.string().uuid().nullish(),
    contractorId: z.string().uuid().nullish(),
    contractorName: z.string().max(200).nullish(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    requirements: z.array(z.string().max(300)).max(30).default([]),
  });
  app.post("/permits", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    const starts = new Date(b.startsAt);
    const ends = new Date(b.endsAt);
    if (ends <= starts) return reply.code(400).send({ error: "end_before_start" });
    const c = ctx(req);
    const [row] = await db.insert(schema.permits).values({
      organisationId: c.orgId,
      type: b.type,
      description: b.description,
      buildingId: b.buildingId ?? null,
      jobId: b.jobId ?? null,
      contractorId: b.contractorId ?? null,
      contractorName: b.contractorName ?? null,
      startsAt: starts,
      endsAt: ends,
      requirements: b.requirements,
      status: "requested",
      requestedBy: c.sub,
    }).returning();
    try {
      await notifyOrgRole(c.orgId, ["admin", "supervisor"], {
        type: "permit.requested",
        title: "Permit to work requested",
        body: `${TYPE_LABEL[b.type] || b.type}: ${b.description.slice(0, 140)}`,
        entityType: "permit",
        entityId: row!.id,
      });
    } catch { /* notification failure never blocks the request */ }
    return { permit: row };
  });

  const patchBody = z.object({
    action: z.enum(["approve", "reject", "activate", "close", "cancel"]).optional(),
    note: z.string().max(1000).optional(),
    // Field edits, honoured only while the permit is still 'requested'.
    description: z.string().min(1).max(2000).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    requirements: z.array(z.string().max(300)).max(30).optional(),
    contractorName: z.string().max(200).nullish(),
  });
  app.patch("/permits/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { id } = req.params as { id: string };
    const b = parsed.data;
    const c = ctx(req);
    const role = (req as any).user?.role as string;
    const isStaff = role === "admin" || role === "supervisor";

    const [p] = await db.select().from(schema.permits)
      .where(and(eq(schema.permits.id, id), eq(schema.permits.organisationId, c.orgId))).limit(1);
    if (!p) return reply.code(404).send({ error: "not_found" });

    if (b.action) {
      const set: Record<string, unknown> = {};
      if (b.action === "approve" || b.action === "reject") {
        if (!isStaff) return reply.code(403).send({ error: "forbidden" });
        if (p.status !== "requested") return reply.code(409).send({ error: "not_requested" });
        set.status = b.action === "approve" ? "approved" : "rejected";
        set.approvedBy = c.sub;
        set.approvedAt = new Date();
        if (b.note) set.closedNote = b.note;
      } else if (b.action === "activate") {
        if (p.status !== "approved") return reply.code(409).send({ error: "not_approved" });
        set.status = "active";
      } else if (b.action === "close") {
        if (p.status !== "active" && p.status !== "approved") return reply.code(409).send({ error: "not_active" });
        if (!isStaff && p.requestedBy !== c.sub) return reply.code(403).send({ error: "forbidden" });
        set.status = "closed";
        set.closedAt = new Date();
        if (b.note) set.closedNote = b.note;
      } else if (b.action === "cancel") {
        if (p.status !== "requested" && p.status !== "approved") return reply.code(409).send({ error: "not_cancellable" });
        if (!isStaff && p.requestedBy !== c.sub) return reply.code(403).send({ error: "forbidden" });
        set.status = "cancelled";
        set.closedAt = new Date();
      }
      const [row] = await db.update(schema.permits).set(set).where(eq(schema.permits.id, id)).returning();
      if ((b.action === "approve" || b.action === "reject") && p.requestedBy && p.requestedBy !== c.sub) {
        try {
          await createNotification({
            orgId: c.orgId,
            userId: p.requestedBy,
            type: "permit.decided",
            title: b.action === "approve" ? "Permit approved" : "Permit rejected",
            body: `${TYPE_LABEL[p.type] || p.type}: ${p.description.slice(0, 140)}`,
            entityType: "permit",
            entityId: p.id,
          });
        } catch { /* non-blocking */ }
      }
      return { permit: row };
    }

    // Field edits — requester or staff, only while still requested.
    if (p.status !== "requested") return reply.code(409).send({ error: "locked_after_decision" });
    if (!isStaff && p.requestedBy !== c.sub) return reply.code(403).send({ error: "forbidden" });
    const starts = b.startsAt ? new Date(b.startsAt) : p.startsAt;
    const ends = b.endsAt ? new Date(b.endsAt) : p.endsAt;
    if (ends <= starts) return reply.code(400).send({ error: "end_before_start" });
    const [row] = await db.update(schema.permits)
      .set({
        ...(b.description != null ? { description: b.description } : {}),
        ...(b.startsAt ? { startsAt: starts } : {}),
        ...(b.endsAt ? { endsAt: ends } : {}),
        ...(b.requirements ? { requirements: b.requirements } : {}),
        ...(b.contractorName !== undefined ? { contractorName: b.contractorName } : {}),
      })
      .where(eq(schema.permits.id, id))
      .returning();
    return { permit: row };
  });
}
