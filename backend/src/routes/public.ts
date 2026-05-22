/**
 * Public (unauthenticated) endpoints for tenant/visitor feedback.
 *
 * Each hanger has a printed QR code containing a URL like:
 *   https://bor-systems-backend.onrender.com/public/feedback/<hangerId>
 *
 * Building tenants, visitors, or passing facility staff can scan it to:
 *   - Confirm the area is dry now ("👍 area is dry")
 *   - Report it's still wet hours later ("👎 still wet")
 *   - Just see when the spill was first reported (transparency)
 *
 * The feedback gets attached to the most recent alert for that hanger and
 * surfaces in the admin dashboard. Generates real-time engagement +
 * shows the facility is responsive.
 *
 * Rate-limited per-IP at the global level (300/min) but a tighter
 * dedicated limit applied here so feedback can't be spammed.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const feedbackSchema = z.object({
  isDry: z.boolean(),
  note: z.string().max(200).optional(),
});

const feedbackRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `feedback:${req.ip}`,
    },
  },
};

export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  // ─── Get hanger status (page load) ──────────────────────────────────
  // Returns a minimal public-safe view of the hanger: zone name, current
  // alert state ("Spill reported 15 minutes ago"). No org details, no
  // user details, no map. Just enough for the public to see what's going on.
  app.get("/public/feedback/:hangerId", async (req, reply) => {
    const { hangerId } = req.params as { hangerId: string };

    const [hanger] = await db
      .select({
        zoneName: schema.zones.name,
        floorName: schema.floors.name,
      })
      .from(schema.hangers)
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .where(eq(schema.hangers.id, hangerId))
      .limit(1);
    if (!hanger) return reply.code(404).send({ error: "unknown_hanger" });

    const [openAlert] = await db
      .select({
        id: schema.alerts.id,
        openedAt: schema.alerts.openedAt,
        acknowledgedAt: schema.alerts.acknowledgedAt,
      })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.hangerId, hangerId),
        isNull(schema.alerts.closedAt),
      ))
      .orderBy(desc(schema.alerts.openedAt))
      .limit(1);

    return {
      zoneName: hanger.zoneName,
      floorName: hanger.floorName,
      hasOpenAlert: !!openAlert,
      openedAt: openAlert?.openedAt?.toISOString() ?? null,
      acknowledgedAt: openAlert?.acknowledgedAt?.toISOString() ?? null,
    };
  });

  // ─── Submit feedback ────────────────────────────────────────────────
  // Attaches feedback to the most recent (open or recently closed) alert.
  // Stored as a closure note + audit-log entry for the admin's visibility.
  app.post(
    "/public/feedback/:hangerId",
    feedbackRateLimit,
    async (req, reply) => {
      const { hangerId } = req.params as { hangerId: string };
      const parsed = feedbackSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

      const [hanger] = await db
        .select({ orgId: schema.hangers.organisationId })
        .from(schema.hangers)
        .where(eq(schema.hangers.id, hangerId))
        .limit(1);
      if (!hanger) return reply.code(404).send({ error: "unknown_hanger" });

      const [recentAlert] = await db
        .select({ id: schema.alerts.id })
        .from(schema.alerts)
        .where(eq(schema.alerts.hangerId, hangerId))
        .orderBy(desc(schema.alerts.openedAt))
        .limit(1);

      // Audit log of the feedback so admins can see public engagement,
      // even when there's no live alert to attach it to.
      const tag = parsed.data.isDry ? "tenant_confirmed_dry" : "tenant_reports_wet";
      const detail = parsed.data.note ?? "";
      await db.insert(schema.auditLog).values({
        organisationId: hanger.orgId,
        userId: null,
        action: tag,
        entityType: "hanger",
        entityId: hangerId,
        detail,
      });

      // If there's an active alert and the tenant says "still wet", flag
      // the alert as escalated so it bubbles up in the admin dashboard.
      if (recentAlert && !parsed.data.isDry) {
        await db
          .update(schema.alerts)
          .set({ escalatedAt: new Date() })
          .where(eq(schema.alerts.id, recentAlert.id));
      }

      return { ok: true };
    },
  );
}
