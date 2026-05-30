import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function hangerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/hangers", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    return { hangers: await db.select().from(schema.hangers).where(eq(schema.hangers.organisationId, c.orgId)) };
  });

  app.post(
    "/hangers/register",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const body = z
        .object({
          // Two accepted formats:
          //   - 16 hex chars: legacy LoRaWAN DevEUI ("0011223344556677")
          //   - "BOR" + 13 hex chars: our firmware's MAC-derived format
          //     ("BOR3C0F02EADB342" — 3 letters + 6-byte MAC + 1-nibble checksum)
          devEui: z.string().regex(
            /^(BOR[0-9A-Fa-f]{13}|[0-9A-Fa-f]{16})$/,
            "devEui must be 16 hex chars or BOR + 13 hex chars",
          ),
          zoneId: z.string().uuid().optional(),
          audibleAlarmEnabled: z.boolean().default(false),
        })
        .safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "invalid_input",
          // Surface Zod's per-field messages so the dashboard can show a
          // useful hint instead of a generic "rejected" toast.
          details: body.error.flatten().fieldErrors,
        });
      }
      const c = ctx(req);

      try {
        const [created] = await db
          .insert(schema.hangers)
          .values({
            organisationId: c.orgId,
            devEui: body.data.devEui.toUpperCase(),
            zoneId: body.data.zoneId,
            audibleAlarmEnabled: body.data.audibleAlarmEnabled,
          })
          .returning();
        return { hanger: created };
      } catch (err: any) {
        if (String(err).includes("hangers_dev_eui_unique")) {
          return reply.code(409).send({ error: "dev_eui_already_registered" });
        }
        throw err;
      }
    },
  );

  app.post(
    "/hangers/:id/relocate",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z.object({ zoneId: z.string().uuid() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await db.update(schema.hangers).set({ zoneId: body.data.zoneId })
        .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)));
      return { ok: true };
    },
  );

  app.post(
    "/hangers/:id/decommission",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      await db.update(schema.hangers).set({ status: "decommissioned" })
        .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)));
      return { ok: true };
    },
  );

  app.post(
    "/hangers/:id/recommission",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      await db.update(schema.hangers).set({ status: "active" })
        .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)));
      return { ok: true };
    },
  );

  // Hard-delete a hanger and everything that references it. Admin-only.
  //
  // Unlike decommission (which keeps the row + audit history), this fully
  // removes the device — for clearing test/seed/misregistered entries.
  // alerts.hangerId is onDelete:"restrict", so we must delete dependent
  // alerts (and their events) first, inside a transaction, or the hanger
  // delete errors out. events.hangerId is onDelete:"cascade" so those go
  // automatically, but we delete explicitly for clarity + to also clear
  // any alert-attached events.
  app.delete(
    "/hangers/:id",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);

      // Confirm the hanger belongs to the caller's org before touching anything.
      const [hanger] = await db
        .select({ id: schema.hangers.id })
        .from(schema.hangers)
        .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)))
        .limit(1);
      if (!hanger) return reply.code(404).send({ error: "not_found" });

      await db.transaction(async (tx) => {
        // alerts → restrict FK, must go first. (events cascade from both
        // hanger and alert, but delete explicitly to be safe across schema
        // variations.)
        await tx.delete(schema.alerts).where(eq(schema.alerts.hangerId, id));
        await tx.delete(schema.events).where(eq(schema.events.hangerId, id));
        await tx
          .delete(schema.hangers)
          .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)));
      });

      return { ok: true };
    },
  );

  // Unified edit — name, location note, zone, audible alarm in one call.
  // Subsumes the existing /relocate endpoint (which stays around for
  // back-compat with older app builds) and adds the new name + locationNote
  // fields introduced in migration 0012. Each field is optional; omitted
  // fields preserve their existing value.
  //
  // Empty strings for name/locationNote clear the column back to NULL —
  // useful so the dashboard "clear name" action just sends "".
  app.patch(
    "/hangers/:id",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          name: z.string().max(80).nullable().optional(),
          locationNote: z.string().max(280).nullable().optional(),
          // null clears the zone assignment; string is a valid zone id.
          zoneId: z.string().uuid().nullable().optional(),
          audibleAlarmEnabled: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);

      const updates: Record<string, unknown> = {};
      if (body.data.name !== undefined) {
        updates.name = body.data.name?.trim() || null;
      }
      if (body.data.locationNote !== undefined) {
        updates.locationNote = body.data.locationNote?.trim() || null;
      }
      if (body.data.zoneId !== undefined) {
        updates.zoneId = body.data.zoneId;
      }
      if (body.data.audibleAlarmEnabled !== undefined) {
        updates.audibleAlarmEnabled = body.data.audibleAlarmEnabled;
      }
      if (Object.keys(updates).length === 0) return { ok: true };

      await db.update(schema.hangers)
        .set(updates)
        .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)));
      return { ok: true };
    },
  );
}
