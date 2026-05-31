import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { uploadFloorPlan } from "../services/storage.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

async function assertFloorInOrg(floorId: string, orgId: string): Promise<boolean> {
  const [f] = await db
    .select({ id: schema.floors.id })
    .from(schema.floors)
    .where(and(eq(schema.floors.id, floorId), eq(schema.floors.organisationId, orgId)))
    .limit(1);
  return !!f;
}

async function assertZoneInOrg(zoneId: string, orgId: string): Promise<boolean> {
  const [z] = await db
    .select({ id: schema.zones.id })
    .from(schema.zones)
    .where(and(eq(schema.zones.id, zoneId), eq(schema.zones.organisationId, orgId)))
    .limit(1);
  return !!z;
}

export default async function buildingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/buildings", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    return { buildings: await db.select().from(schema.buildings).where(eq(schema.buildings.organisationId, c.orgId)) };
  });

  app.post("/buildings", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [b] = await db.insert(schema.buildings).values({ organisationId: c.orgId, name: body.data.name }).returning();
    return { building: b };
  });

  app.get("/buildings/:id/floors", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const rows = await db.select().from(schema.floors)
      .where(and(eq(schema.floors.buildingId, id), eq(schema.floors.organisationId, c.orgId)));
    return { floors: rows };
  });

  app.post("/buildings/:id/floors", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const body = z.object({ name: z.string().min(1), orderIndex: z.number().int() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });

    const [building] = await db.select().from(schema.buildings)
      .where(and(eq(schema.buildings.id, id), eq(schema.buildings.organisationId, c.orgId)))
      .limit(1);
    if (!building) return reply.code(404).send({ error: "not_found" });

    const [f] = await db.insert(schema.floors)
      .values({ organisationId: c.orgId, buildingId: id, ...body.data })
      .returning();
    return { floor: f };
  });

  app.get("/floors/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [floor] = await db.select().from(schema.floors)
      .where(and(eq(schema.floors.id, id), eq(schema.floors.organisationId, c.orgId)))
      .limit(1);
    if (!floor) return reply.code(404).send({ error: "not_found" });
    return { floor };
  });

  // Reorder / rename a floor. Used by the Floor plans admin page to drive
  // the order they appear in the Active alerts dashboard feed.
  app.patch("/floors/:id", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const body = z.object({
      name: z.string().min(1).optional(),
      orderIndex: z.number().int().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (Object.keys(body.data).length === 0) return reply.code(400).send({ error: "nothing_to_update" });

    if (!(await assertFloorInOrg(id, c.orgId))) return reply.code(404).send({ error: "not_found" });

    const [updated] = await db.update(schema.floors)
      .set(body.data)
      .where(and(eq(schema.floors.id, id), eq(schema.floors.organisationId, c.orgId)))
      .returning();
    return { floor: updated };
  });

  app.post("/floors/:id/floor-plan", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    if (!(await assertFloorInOrg(id, c.orgId))) return reply.code(404).send({ error: "not_found" });

    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (!["image/png", "image/jpeg"].includes(file.mimetype)) {
      return reply.code(400).send({ error: "must_be_png_or_jpeg" });
    }
    const buf = await file.toBuffer();
    const { url } = await uploadFloorPlan({ filename: file.filename, mimetype: file.mimetype, body: buf });
    await db.update(schema.floors).set({ floorPlanUrl: url }).where(eq(schema.floors.id, id));
    return { url };
  });

  app.get("/floors/:id/zones", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    if (!(await assertFloorInOrg(id, c.orgId))) return reply.code(404).send({ error: "not_found" });
    const rows = await db.select().from(schema.zones)
      .where(and(eq(schema.zones.floorId, id), eq(schema.zones.organisationId, c.orgId)));
    return { zones: rows };
  });

  app.post("/floors/:id/zones", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const body = z
      .object({ name: z.string().min(1), pinX: z.number().int().nullable().optional(), pinY: z.number().int().nullable().optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (!(await assertFloorInOrg(id, c.orgId))) return reply.code(404).send({ error: "not_found" });
    const [zone] = await db.insert(schema.zones).values({ organisationId: c.orgId, floorId: id, ...body.data }).returning();
    return { zone };
  });

  app.patch("/zones/:id", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        pinX: z.number().int().nullable().optional(),
        pinY: z.number().int().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    if (!(await assertZoneInOrg(id, c.orgId))) return reply.code(404).send({ error: "not_found" });
    await db.update(schema.zones).set(body.data).where(eq(schema.zones.id, id));
    return { ok: true };
  });

  // Delete a zone. Safe to hard-delete: every table that references a zone
  // (hangers, dispatches, alerts) uses onDelete:"set null", so any hanger
  // sitting in this zone simply becomes unassigned rather than blocking the
  // delete or cascading away. Used to clear orphaned zones (e.g. ones left
  // behind after a mis-registered device was removed).
  app.delete("/zones/:id", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    if (!(await assertZoneInOrg(id, c.orgId))) return reply.code(404).send({ error: "not_found" });
    await db.delete(schema.zones).where(eq(schema.zones.id, id));
    return { ok: true };
  });
}
