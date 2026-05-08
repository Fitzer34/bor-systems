import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const shiftFields = z.object({
  userId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  buildingId: z.string().uuid().nullable().optional(),
  floorId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
const shiftBody = shiftFields.refine(
  (s) => new Date(s.endsAt) > new Date(s.startsAt),
  { message: "ends_at must be after starts_at" },
);

export default async function shiftRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/shifts",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const q = z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          userId: z.string().uuid().optional(),
        })
        .safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);

      const conds = [eq(schema.shifts.organisationId, c.orgId)];
      if (q.data.from) conds.push(gte(schema.shifts.endsAt, new Date(q.data.from)));
      if (q.data.to) conds.push(lte(schema.shifts.startsAt, new Date(q.data.to)));
      if (q.data.userId) conds.push(eq(schema.shifts.userId, q.data.userId));

      const rows = await db
        .select({
          id: schema.shifts.id,
          userId: schema.shifts.userId,
          userName: schema.users.name,
          startsAt: schema.shifts.startsAt,
          endsAt: schema.shifts.endsAt,
          buildingId: schema.shifts.buildingId,
          buildingName: schema.buildings.name,
          floorId: schema.shifts.floorId,
          floorName: schema.floors.name,
          zoneId: schema.shifts.zoneId,
          zoneName: schema.zones.name,
          notes: schema.shifts.notes,
        })
        .from(schema.shifts)
        .leftJoin(schema.users, eq(schema.users.id, schema.shifts.userId))
        .leftJoin(schema.buildings, eq(schema.buildings.id, schema.shifts.buildingId))
        .leftJoin(schema.floors, eq(schema.floors.id, schema.shifts.floorId))
        .leftJoin(schema.zones, eq(schema.zones.id, schema.shifts.zoneId))
        .where(and(...conds))
        .orderBy(desc(schema.shifts.startsAt));
      return { shifts: rows };
    },
  );

  app.post(
    "/shifts",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = shiftBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input", details: body.error.flatten() });
      const c = ctx(req);
      const [shift] = await db
        .insert(schema.shifts)
        .values({
          organisationId: c.orgId,
          userId: body.data.userId,
          startsAt: new Date(body.data.startsAt),
          endsAt: new Date(body.data.endsAt),
          buildingId: body.data.buildingId ?? null,
          floorId: body.data.floorId ?? null,
          zoneId: body.data.zoneId ?? null,
          notes: body.data.notes ?? null,
          createdBy: c.sub,
        })
        .returning();
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "shift.created",
        targetType: "shift",
        targetId: shift!.id,
        metadata: { userId: body.data.userId, startsAt: body.data.startsAt, endsAt: body.data.endsAt },
      });
      return { shift };
    },
  );

  app.patch(
    "/shifts/:id",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = shiftFields.partial().safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const update: Record<string, unknown> = {};
      if (body.data.userId) update.userId = body.data.userId;
      if (body.data.startsAt) update.startsAt = new Date(body.data.startsAt);
      if (body.data.endsAt) update.endsAt = new Date(body.data.endsAt);
      if (body.data.buildingId !== undefined) update.buildingId = body.data.buildingId;
      if (body.data.floorId !== undefined) update.floorId = body.data.floorId;
      if (body.data.zoneId !== undefined) update.zoneId = body.data.zoneId;
      if (body.data.notes !== undefined) update.notes = body.data.notes;
      await db.update(schema.shifts).set(update)
        .where(and(eq(schema.shifts.id, id), eq(schema.shifts.organisationId, c.orgId)));
      return { ok: true };
    },
  );

  app.delete(
    "/shifts/:id",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      await db.delete(schema.shifts).where(and(
        eq(schema.shifts.id, id),
        eq(schema.shifts.organisationId, c.orgId),
      ));
      await db.insert(schema.auditLog).values({
        organisationId: c.orgId,
        actorUserId: c.sub,
        action: "shift.deleted",
        targetType: "shift",
        targetId: id,
      });
      return { ok: true };
    },
  );
}
