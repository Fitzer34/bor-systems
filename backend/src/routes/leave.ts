/**
 * Staff leave / time off.
 *
 *   GET    /leave?from&to      org's leave rows (any signed-in user — the team
 *                              page shows who's off; nothing sensitive here)
 *   POST   /leave              book or request time off:
 *                                admin/supervisor + userId → APPROVED immediately
 *                                (the "mark somebody off this week" click)
 *                                anyone for themselves     → PENDING request
 *   PATCH  /leave/:id          approve / decline (staff) · cancel (owner or staff)
 *
 * Approvals and bookings notify the person; new pending requests notify
 * admins + supervisors through the notification centre.
 */
import type { FastifyInstance } from "fastify";
import { audit } from "../services/audit.js";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { createNotification, notifyOrgRole } from "../services/notification-centre.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const LEAVE_TYPES = ["annual", "sick", "unpaid", "other"] as const;

function fmt(d: string): string {
  return d; // ISO date; the client renders it nicely
}

export default async function leaveRoutes(app: FastifyInstance): Promise<void> {
  app.get("/leave", { preHandler: [app.authenticate] }, async (req, reply) => {
    const q = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const conds = [eq(schema.leaveRequests.organisationId, c.orgId)];
    // Range filter: any row overlapping [from, to].
    if (q.data.from) conds.push(gte(schema.leaveRequests.endsOn, q.data.from));
    if (q.data.to) conds.push(lte(schema.leaveRequests.startsOn, q.data.to));
    const rows = await db.select().from(schema.leaveRequests).where(and(...conds)).limit(1000);
    return { leave: rows };
  });

  const createBody = z.object({
    userId: z.string().uuid().optional(), // staff booking someone else
    type: z.enum(LEAVE_TYPES).default("annual"),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500).optional(),
  });
  app.post("/leave", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const b = parsed.data;
    if (b.endsOn < b.startsOn) return reply.code(400).send({ error: "end_before_start" });
    const c = ctx(req);
    const actorRole = (req as any).user?.role as string;
    const isStaff = actorRole === "admin" || actorRole === "supervisor";
    const targetId = b.userId ?? c.sub;
    if (targetId !== c.sub && !isStaff) return reply.code(403).send({ error: "forbidden" });

    const [target] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(eq(schema.users.id, targetId), eq(schema.users.organisationId, c.orgId)))
      .limit(1);
    if (!target) return reply.code(404).send({ error: "not_found" });

    // A staff member booking (for anyone, themselves included) applies
    // immediately; a field-staff self-request waits for approval.
    const status = isStaff ? "approved" : "pending";

    const [row] = await db.insert(schema.leaveRequests).values({
      organisationId: c.orgId,
      userId: targetId,
      type: b.type,
      startsOn: b.startsOn,
      endsOn: b.endsOn,
      note: b.note ?? null,
      status,
      createdBy: c.sub,
      ...(status === "approved" ? { decidedBy: c.sub, decidedAt: new Date() } : {}),
    }).returning();

    try {
      if (status === "approved" && targetId !== c.sub) {
        await createNotification({
          orgId: c.orgId, userId: targetId, type: "leave.decided",
          title: "Time off booked for you",
          body: `${b.type} leave, ${fmt(b.startsOn)} to ${fmt(b.endsOn)}.`,
          entityType: "leave", entityId: row!.id,
        });
      } else if (status === "pending") {
        await notifyOrgRole(c.orgId, ["admin", "supervisor"], {
          type: "leave.requested",
          title: `Leave request from ${target.name}`,
          body: `${b.type} leave, ${fmt(b.startsOn)} to ${fmt(b.endsOn)} — awaiting approval.`,
          entityType: "leave", entityId: row!.id,
        });
      }
    } catch (err) {
      req.log.error({ err }, "leave notification failed");
    }

    return { leave: row };
  });

  app.patch("/leave/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ status: z.enum(["approved", "declined", "cancelled"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const actorRole = (req as any).user?.role as string;
    const isStaff = actorRole === "admin" || actorRole === "supervisor";

    const [row] = await db
      .select()
      .from(schema.leaveRequests)
      .where(and(eq(schema.leaveRequests.id, id), eq(schema.leaveRequests.organisationId, c.orgId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found" });

    const next = parsed.data.status;
    // Approve/decline is a staff action; cancelling is allowed to the owner too.
    if ((next === "approved" || next === "declined") && !isStaff) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (next === "cancelled" && !isStaff && row.userId !== c.sub) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [updated] = await db
      .update(schema.leaveRequests)
      .set({ status: next, decidedBy: c.sub, decidedAt: new Date() })
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    audit(c.orgId, c.sub, "leave." + next, "leave_request", id, { userId: row.userId, type: row.type });

    if ((next === "approved" || next === "declined") && row.userId !== c.sub) {
      try {
        await createNotification({
          orgId: c.orgId, userId: row.userId, type: "leave.decided",
          title: next === "approved" ? "Leave request approved" : "Leave request declined",
          body: `${row.type} leave, ${fmt(row.startsOn)} to ${fmt(row.endsOn)}.`,
          entityType: "leave", entityId: row.id,
        });
      } catch (err) {
        req.log.error({ err }, "leave notification failed");
      }
    }

    return { leave: updated };
  });
}
