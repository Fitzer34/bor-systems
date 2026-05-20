/**
 * Sign-tag CRUD + lookup endpoints.
 *
 * A sign-tag is the small BLE+UWB module embedded in a wet floor sign's
 * handle. It pairs to a hanger so the "Find sign" feature in the mobile
 * apps knows which BLE peer to connect to when a spill alert fires.
 *
 * Endpoints:
 *   POST   /sign-tags                 — register a new tag (admin)
 *   GET    /sign-tags                 — list all tags in the org (admin/supervisor)
 *   PATCH  /sign-tags/:id             — pair to a hanger / update battery
 *   DELETE /sign-tags/:id             — decommission
 *   GET    /sign-tags/for-alert/:id   — look up the tag paired to an alert's
 *                                       hanger (used by the iOS/Android
 *                                       "Find sign" view; returns 404 if no
 *                                       tag is paired, app falls back to
 *                                       floor plan)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const requireRole =
  (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };

const createSchema = z.object({
  bleUuid: z.string().min(8).max(64),
  uwbAddress: z.string().regex(/^[0-9A-Fa-f]{8,16}$/),
  pairedHangerId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  pairedHangerId: z.string().uuid().nullable().optional(),
  batteryPct: z.number().int().min(0).max(100).optional(),
});

export default async function signTagRoutes(app: FastifyInstance): Promise<void> {
  // ─── List ────────────────────────────────────────────────────────────
  app.get(
    "/sign-tags",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req) => {
      const c = ctx(req);
      const rows = await db
        .select()
        .from(schema.signTags)
        .where(eq(schema.signTags.organisationId, c.orgId));
      return { tags: rows };
    },
  );

  // ─── Create ──────────────────────────────────────────────────────────
  app.post(
    "/sign-tags",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);

      // If a hanger is provided, verify it belongs to the same org so
      // we don't accidentally let one customer pair a tag to another
      // customer's hanger.
      if (parsed.data.pairedHangerId) {
        const [hanger] = await db
          .select()
          .from(schema.hangers)
          .where(and(
            eq(schema.hangers.id, parsed.data.pairedHangerId),
            eq(schema.hangers.organisationId, c.orgId),
          ))
          .limit(1);
        if (!hanger) return reply.code(400).send({ error: "hanger_not_in_org" });
      }

      try {
        const [created] = await db
          .insert(schema.signTags)
          .values({
            organisationId: c.orgId,
            bleUuid: parsed.data.bleUuid,
            uwbAddress: parsed.data.uwbAddress.toUpperCase(),
            pairedHangerId: parsed.data.pairedHangerId,
          })
          .returning();
        return reply.code(201).send(created);
      } catch {
        // Most likely a unique-violation on bleUuid or uwbAddress.
        return reply.code(409).send({ error: "tag_already_registered" });
      }
    },
  );

  // ─── Update (pair/unpair, battery report) ────────────────────────────
  app.patch(
    "/sign-tags/:id",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);

      if (parsed.data.pairedHangerId) {
        const [hanger] = await db
          .select()
          .from(schema.hangers)
          .where(and(
            eq(schema.hangers.id, parsed.data.pairedHangerId),
            eq(schema.hangers.organisationId, c.orgId),
          ))
          .limit(1);
        if (!hanger) return reply.code(400).send({ error: "hanger_not_in_org" });
      }

      const result = await db
        .update(schema.signTags)
        .set({
          ...(parsed.data.pairedHangerId !== undefined && {
            pairedHangerId: parsed.data.pairedHangerId,
          }),
          ...(parsed.data.batteryPct !== undefined && {
            batteryPct: parsed.data.batteryPct,
            lastSeenAt: new Date(),
          }),
        })
        .where(and(
          eq(schema.signTags.id, id),
          eq(schema.signTags.organisationId, c.orgId),
        ))
        .returning();
      if (!result[0]) return reply.code(404).send({ error: "not_found" });
      return result[0];
    },
  );

  // ─── Delete ──────────────────────────────────────────────────────────
  app.delete(
    "/sign-tags/:id",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      const result = await db
        .delete(schema.signTags)
        .where(and(
          eq(schema.signTags.id, id),
          eq(schema.signTags.organisationId, c.orgId),
        ))
        .returning({ id: schema.signTags.id });
      if (!result[0]) return reply.code(404).send({ error: "not_found" });
      return { ok: true };
    },
  );

  // ─── Look up tag for a specific alert (mobile "Find sign" entry) ─────
  //
  // The iOS/Android FindSignView calls this after the cleaner taps "Find
  // sign". If a paired tag exists, returns { bleUuid, uwbAddress } the
  // app needs to start a NearbyInteraction / UWB session. If no tag is
  // paired (or no tag exists), returns 404 and the app falls back to the
  // floor-plan zone-pin view.
  app.get(
    "/sign-tags/for-alert/:alertId",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { alertId } = req.params as { alertId: string };
      const c = ctx(req);

      const [row] = await db
        .select({
          tagId: schema.signTags.id,
          bleUuid: schema.signTags.bleUuid,
          uwbAddress: schema.signTags.uwbAddress,
          batteryPct: schema.signTags.batteryPct,
        })
        .from(schema.alerts)
        .innerJoin(schema.signTags, eq(schema.signTags.pairedHangerId, schema.alerts.hangerId))
        .where(and(
          eq(schema.alerts.id, alertId),
          eq(schema.alerts.organisationId, c.orgId),
          eq(schema.signTags.organisationId, c.orgId),
        ))
        .limit(1);

      if (!row) return reply.code(404).send({ error: "no_paired_tag" });
      return row;
    },
  );
}
