import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { requirePermission } from "../services/permissions.js";

/**
 * The sign_tags table needs a unique uwbAddress, but when a tracker is assigned
 * by scanning it from the phone we only have its BLE identity — the real UWB MAC
 * isn't exchanged until ranging starts. So derive a stable, unique placeholder
 * from the BLE id (16 hex chars). It's metadata only; "Find sign" matches on the
 * BLE id, not this.
 */
function deriveUwbAddress(bleUuid: string): string {
  return createHash("sha256").update(bleUuid).digest("hex").slice(0, 16).toUpperCase();
}

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function hangerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/hangers", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    // Left-join the paired find-sign tracker (1 per hanger) so the apps can show
    // "tracker assigned" + battery without a second round-trip. Also resolve the
    // hanger's building (hanger→zone→floor→building) so we can attach the
    // gateway it reports via.
    const rows = await db
      .select({
        hanger: schema.hangers,
        tagId: schema.signTags.id,
        tagBle: schema.signTags.bleUuid,
        tagBattery: schema.signTags.batteryPct,
        tagSeen: schema.signTags.lastSeenAt,
        buildingId: schema.buildings.id,
      })
      .from(schema.hangers)
      .leftJoin(schema.signTags, eq(schema.signTags.pairedHangerId, schema.hangers.id))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .leftJoin(schema.buildings, eq(schema.buildings.id, schema.floors.buildingId))
      .where(eq(schema.hangers.organisationId, c.orgId));

    // Resolve a gateway per building (the box the hanger's packets flow through).
    // A building may have several gateways; prefer the most-recently-seen one.
    // One small query for the org's gateways, then map in memory.
    const gateways = await db
      .select({
        id: schema.gateways.id,
        name: schema.gateways.name,
        buildingId: schema.gateways.buildingId,
        rssi: schema.gateways.rssi,
        lastSeenAt: schema.gateways.lastSeenAt,
      })
      .from(schema.gateways)
      .where(eq(schema.gateways.organisationId, c.orgId));
    const gatewayByBuilding = new Map<string, typeof gateways[number]>();
    for (const g of gateways) {
      if (!g.buildingId) continue;
      const cur = gatewayByBuilding.get(g.buildingId);
      const gSeen = g.lastSeenAt?.getTime() ?? 0;
      const curSeen = cur?.lastSeenAt?.getTime() ?? 0;
      if (!cur || gSeen > curSeen) gatewayByBuilding.set(g.buildingId, g);
    }

    return {
      hangers: rows.map((r) => {
        const gw = r.buildingId ? gatewayByBuilding.get(r.buildingId) ?? null : null;
        return {
          ...r.hanger,
          // lastLiftedAt is on the hanger row (stamped on lift events).
          // No per-hanger RSSI exists on the device; surface the resolved
          // gateway's RSSI as the best-available signal proxy, else null.
          signal: gw?.rssi ?? null,
          rssi: gw?.rssi ?? null,
          reportsViaGatewayId: gw?.id ?? null,
          reportsViaGatewayName: gw?.name ?? null,
          tracker: r.tagId
            ? { id: r.tagId, bleUuid: r.tagBle, batteryPct: r.tagBattery, lastSeenAt: r.tagSeen }
            : null,
        };
      }),
    };
  });

  app.post(
    "/hangers/register",
    { preHandler: [app.authenticate, requireRole(["admin"]), requirePermission("action.manage_devices")] },
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
    { preHandler: [app.authenticate, requireRole(["admin"]), requirePermission("action.delete_records")] },
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

  // ── Find-sign tracker (hanger-centric assignment) ────────────────────────
  // Simple UX: from the phone you scan the tracker next to a sign and pin it to
  // that hanger. One tracker per hanger; re-assigning replaces the previous one.
  app.put(
    "/hangers/:id/tracker",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      // BLE identity captured by the app's scan (CoreBluetooth id or adv name).
      const body = z.object({ bleUuid: z.string().min(2).max(80) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);

      const [hanger] = await db
        .select({ id: schema.hangers.id })
        .from(schema.hangers)
        .where(and(eq(schema.hangers.id, id), eq(schema.hangers.organisationId, c.orgId)))
        .limit(1);
      if (!hanger) return reply.code(404).send({ error: "not_found" });

      const bleUuid = body.data.bleUuid.trim();

      // One tracker per hanger: unpair whatever was on this hanger before.
      await db
        .update(schema.signTags)
        .set({ pairedHangerId: null })
        .where(and(
          eq(schema.signTags.pairedHangerId, id),
          eq(schema.signTags.organisationId, c.orgId),
        ));

      // Upsert by BLE id so re-scanning the same physical tracker reuses its row
      // (moving it to this hanger) instead of hitting the unique-index error.
      const [existing] = await db
        .select()
        .from(schema.signTags)
        .where(and(
          eq(schema.signTags.bleUuid, bleUuid),
          eq(schema.signTags.organisationId, c.orgId),
        ))
        .limit(1);

      let tag;
      if (existing) {
        [tag] = await db
          .update(schema.signTags)
          .set({ pairedHangerId: id })
          .where(eq(schema.signTags.id, existing.id))
          .returning();
      } else {
        [tag] = await db
          .insert(schema.signTags)
          .values({
            organisationId: c.orgId,
            bleUuid,
            uwbAddress: deriveUwbAddress(bleUuid),
            pairedHangerId: id,
          })
          .returning();
      }

      if (!tag) return reply.code(500).send({ error: "tracker_assign_failed" });
      return {
        tracker: {
          id: tag.id,
          bleUuid: tag.bleUuid,
          batteryPct: tag.batteryPct,
          lastSeenAt: tag.lastSeenAt,
        },
      };
    },
  );

  // Remove a hanger's tracker (deletes the tag record).
  app.delete(
    "/hangers/:id/tracker",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      await db
        .delete(schema.signTags)
        .where(and(
          eq(schema.signTags.pairedHangerId, id),
          eq(schema.signTags.organisationId, c.orgId),
        ));
      return { ok: true };
    },
  );
}
