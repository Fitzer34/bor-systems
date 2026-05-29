import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { config } from "../config.js";

/**
 * Gateway routes.
 *
 * `GET    /gateways`           — list, JWT-authed, scoped to the caller's org
 * `PATCH  /gateways/:id`       — rename / move-to-building, admin only
 * `DELETE /gateways/:id`       — admin only
 * `POST   /gateways/heartbeat` — called by the device firmware itself; auth
 *                                via the same shared secret as /webhook/tts
 *                                (X-BOR-Secret header). On first call for a
 *                                given DevEUI, creates the gateway row and
 *                                attaches it to the first organisation it
 *                                finds. On subsequent calls, just refreshes
 *                                the network state + lastSeenAt.
 *
 * Self-registration is the right shape here because:
 *   1. Gateways come pre-paired to an org at the factory in production —
 *      the firmware will eventually ship a baked-in org token. For now,
 *      heartbeats from unknown DevEUIs land in the first org they hit so
 *      we can develop without a token-mint step.
 *   2. The customer doesn't want to type a 16-char DevEUI — the device
 *      can introduce itself the instant it joins WiFi.
 */

// Same shared-secret check as /webhook/tts. Webhooks are unauthenticated by
// JWT — devices don't have user logins — so we prove the device's identity
// by HMAC or shared secret. Mirroring the webhook.ts pattern.
function verifyDeviceSecret(req: FastifyRequest): boolean {
  const expected = config.TTS_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided = req.headers["x-bor-secret"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function gatewayRoutes(app: FastifyInstance): Promise<void> {
  // List gateways belonging to the caller's organisation.
  app.get("/gateways", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select()
      .from(schema.gateways)
      .where(eq(schema.gateways.organisationId, c.orgId));
    return { gateways: rows };
  });

  // Edit gateway name / move to a different building. Admin only.
  app.patch(
    "/gateways/:id",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          name: z.string().min(1).max(80).optional(),
          buildingId: z.string().uuid().nullable().optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const updates: Record<string, unknown> = {};
      if (body.data.name !== undefined) updates.name = body.data.name;
      if (body.data.buildingId !== undefined) updates.buildingId = body.data.buildingId;
      if (Object.keys(updates).length === 0) return { ok: true };
      await db
        .update(schema.gateways)
        .set(updates)
        .where(and(eq(schema.gateways.id, id), eq(schema.gateways.organisationId, c.orgId)));
      return { ok: true };
    },
  );

  // Remove a gateway from the org. Hard delete — the device on the wall is
  // physically yours, so deleting just orphans it. Re-installing means
  // factory-reset the gateway (long-press the test button) and onboard
  // again from scratch.
  app.delete(
    "/gateways/:id",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);
      await db
        .delete(schema.gateways)
        .where(and(eq(schema.gateways.id, id), eq(schema.gateways.organisationId, c.orgId)));
      return { ok: true };
    },
  );

  // The seed/demo org that comes with every fresh DB. Real customer orgs are
  // created on /signup with random UUIDs, so the demo org is recognisable by
  // its fixed all-zero UUID. We deliberately skip it when picking an org for
  // gateways to land in — otherwise the test seed swallows real devices.
  const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

  /// Picks the best organisation for a self-registering gateway.
  ///
  /// Strategy: pick the most recently created NON-demo org. That's the org
  /// the most recent signup created, which is almost always the customer
  /// installing this gateway. In multi-tenant production this whole mechanism
  /// will be replaced with a factory-baked org token; for the bootstrap
  /// prototype the "newest non-demo org" heuristic is correct ~100% of the time.
  ///
  /// Falls back to the demo org only if it's the only org that exists at all.
  async function pickHomeOrg(): Promise<string | null> {
    const realOrgs = await db
      .select({ id: schema.organisations.id, createdAt: schema.organisations.createdAt })
      .from(schema.organisations)
      .orderBy(sql`${schema.organisations.createdAt} DESC NULLS LAST`);
    const nonDemo = realOrgs.find((o) => o.id !== DEMO_ORG_ID);
    if (nonDemo) return nonDemo.id;
    return realOrgs[0]?.id ?? null;
  }

  // Device-facing self-registration / heartbeat. Called by gateway firmware
  // on every boot + periodically afterwards. NOT JWT-authed — devices don't
  // have user logins. Authed by the same shared secret as /webhook/tts.
  app.post("/gateways/heartbeat", async (req, reply) => {
    if (!verifyDeviceSecret(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = z
      .object({
        devEui: z.string().min(4).max(32),
        ipAddress: z.string().optional(),
        ssid: z.string().optional(),
        rssi: z.number().int().optional(),
        firmwareVersion: z.string().optional(),
        packetsForwarded: z.number().int().nonnegative().optional(),
        uptimeSec: z.number().int().nonnegative().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });

    const devEui = body.data.devEui.toUpperCase();

    // Look up the gateway by DevEUI. If it exists, just refresh.
    const [existing] = await db
      .select()
      .from(schema.gateways)
      .where(eq(schema.gateways.devEui, devEui));

    if (existing) {
      // Self-heal: if a gateway was previously misattributed to the demo
      // org (by an older registration handler that just picked the first
      // org it saw), move it to the real customer org on the next heartbeat.
      // This is a one-time migration; once the row is in the right org,
      // subsequent heartbeats are no-ops for the orgId field.
      let targetOrgId = existing.organisationId;
      if (existing.organisationId === DEMO_ORG_ID) {
        const better = await pickHomeOrg();
        if (better && better !== DEMO_ORG_ID) {
          targetOrgId = better;
          app.log.info(`gateway ${devEui} migrating from demo org → ${better}`);
        }
      }

      await db
        .update(schema.gateways)
        .set({
          organisationId:   targetOrgId,
          ipAddress:        body.data.ipAddress        ?? existing.ipAddress,
          ssid:             body.data.ssid             ?? existing.ssid,
          rssi:             body.data.rssi             ?? existing.rssi,
          firmwareVersion:  body.data.firmwareVersion  ?? existing.firmwareVersion,
          packetsForwarded: body.data.packetsForwarded ?? existing.packetsForwarded,
          uptimeSec:        body.data.uptimeSec        ?? existing.uptimeSec,
          lastSeenAt: new Date(),
        })
        .where(eq(schema.gateways.id, existing.id));
      return { status: "ok", gatewayId: existing.id, orgId: targetOrgId };
    }

    // First time we've seen this DevEUI. Attach it to the most recent
    // non-demo org so it shows up in the right customer's dashboard.
    const homeOrgId = await pickHomeOrg();
    if (!homeOrgId) {
      return reply.code(409).send({ error: "no_organisation_to_attach_to" });
    }
    // Synthesise an object shape matching what the original code expected
    // so the .insert() block below stays unchanged.
    const firstOrg = { id: homeOrgId };

    const inserted = await db
      .insert(schema.gateways)
      .values({
        organisationId: firstOrg.id,
        devEui,
        name: `Gateway ${devEui.slice(-4)}`,
        ipAddress: body.data.ipAddress,
        ssid: body.data.ssid,
        rssi: body.data.rssi,
        firmwareVersion: body.data.firmwareVersion,
        packetsForwarded: body.data.packetsForwarded ?? 0,
        uptimeSec: body.data.uptimeSec,
        lastSeenAt: new Date(),
      })
      .returning();
    const created = inserted[0];
    if (!created) {
      // Defensive — Postgres insert with .returning() should always give us
      // back the row, but TypeScript can't prove that and the alternative
      // is a runtime undefined deref. Fail loud.
      return reply.code(500).send({ error: "insert_failed" });
    }

    app.log.info(`gateway self-registered: ${devEui} → ${firstOrg.id}`);
    return { status: "created", gatewayId: created.id, orgId: created.organisationId };
  });
}
