import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, schema } from "../db/client.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const UPLOAD_DIR = join(process.cwd(), "uploads", "floorplans");

export default async function buildingRoutes(app: FastifyInstance): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  app.get("/buildings", { preHandler: [app.authenticate] }, async () => {
    return { buildings: await db.select().from(schema.buildings) };
  });

  app.post("/buildings", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const [b] = await db.insert(schema.buildings).values({ name: body.data.name }).returning();
    return { building: b };
  });

  app.get("/buildings/:id/floors", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(schema.floors).where(eq(schema.floors.buildingId, id));
    return { floors: rows };
  });

  app.post("/buildings/:id/floors", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1), orderIndex: z.number().int() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const [f] = await db.insert(schema.floors).values({ buildingId: id, ...body.data }).returning();
    return { floor: f };
  });

  app.post("/floors/:id/floor-plan", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "no_file" });
    if (!["image/png", "image/jpeg"].includes(file.mimetype)) {
      return reply.code(400).send({ error: "must_be_png_or_jpeg" });
    }
    const ext = extname(file.filename) || (file.mimetype === "image/png" ? ".png" : ".jpg");
    const filename = `${randomUUID()}${ext}`;
    const path = join(UPLOAD_DIR, filename);
    await fs.writeFile(path, await file.toBuffer());
    const url = `/uploads/floorplans/${filename}`;
    await db.update(schema.floors).set({ floorPlanUrl: url }).where(eq(schema.floors.id, id));
    return { url };
  });

  app.get("/floors/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [floor] = await db.select().from(schema.floors).where(eq(schema.floors.id, id)).limit(1);
    if (!floor) return reply.code(404).send({ error: "not_found" });
    return { floor };
  });

  app.get("/floors/:id/zones", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(schema.zones).where(eq(schema.zones.floorId, id));
    return { zones: rows };
  });

  app.post("/floors/:id/zones", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ name: z.string().min(1), pinX: z.number().int().nullable().optional(), pinY: z.number().int().nullable().optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const [zone] = await db.insert(schema.zones).values({ floorId: id, ...body.data }).returning();
    return { zone };
  });

  app.patch("/zones/:id", { preHandler: [app.authenticate, requireRole(["admin"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        pinX: z.number().int().nullable().optional(),
        pinY: z.number().int().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await db.update(schema.zones).set(body.data).where(eq(schema.zones.id, id));
    return { ok: true };
  });
}
