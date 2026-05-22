import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { closeAlertForHanger } from "../services/alert-flow.js";
import { notifyEmail, notifyPush } from "../services/notifications.js";
import { ctx } from "../services/auth-context.js";
import { eventBus } from "../services/event-bus.js";
import { uploadClosePhoto } from "../services/storage.js";

export default async function alertRoutes(app: FastifyInstance): Promise<void> {
  app.get("/alerts/active", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    const rows = await db
      .select({
        id: schema.alerts.id,
        hangerId: schema.alerts.hangerId,
        status: schema.alerts.status,
        // `kind` lets clients show planned-cleaning sessions as blue pins on
        // the floor plan while keeping them OUT of the Active alerts list.
        kind: schema.alerts.kind,
        openedAt: schema.alerts.openedAt,
        acknowledgedAt: schema.alerts.acknowledgedAt,
        acknowledgedBy: schema.alerts.acknowledgedBy,
        zoneId: schema.zones.id,
        zoneName: schema.zones.name,
        floorId: schema.floors.id,
        floorName: schema.floors.name,
      })
      .from(schema.alerts)
      .leftJoin(schema.hangers, eq(schema.hangers.id, schema.alerts.hangerId))
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .where(and(eq(schema.alerts.organisationId, c.orgId), isNull(schema.alerts.closedAt)))
      .orderBy(desc(schema.alerts.openedAt));
    return { alerts: rows };
  });

  app.post("/alerts/:id/acknowledge", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const result = await db
      .update(schema.alerts)
      .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: c.sub })
      .where(and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.organisationId, c.orgId),
        eq(schema.alerts.status, "open"),
      ))
      .returning({ id: schema.alerts.id });
    if (!result[0]) return reply.code(409).send({ error: "already_acknowledged_or_closed" });
    eventBus.publish(c.orgId, { type: "alert.acknowledged", alertId: id });
    return { ok: true };
  });

  // Two-step photo upload — mobile app POSTs the image first, gets back a
  // URL, then includes that URL in the /close payload. Keeps the close
  // endpoint pure JSON and matches the floor-plan upload pattern.
  app.post(
    "/alerts/:id/close-photo",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const c = ctx(req);

      // Verify alert exists in this org before letting the photo land —
      // stops cross-tenant photo uploads.
      const [alert] = await db
        .select({ id: schema.alerts.id })
        .from(schema.alerts)
        .where(and(eq(schema.alerts.id, id), eq(schema.alerts.organisationId, c.orgId)))
        .limit(1);
      if (!alert) return reply.code(404).send({ error: "not_found" });

      const file = await (req as any).file();
      if (!file) return reply.code(400).send({ error: "no_file" });
      if (!["image/jpeg", "image/png", "image/heic", "image/heif"].includes(file.mimetype)) {
        return reply.code(400).send({ error: "must_be_image" });
      }
      const buf = await file.toBuffer();
      const { url } = await uploadClosePhoto({
        filename: file.filename,
        mimetype: file.mimetype,
        body: buf,
      });
      return { url };
    },
  );

  app.post("/alerts/:id/close", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);

    const body = z
      .object({
        reason: z.enum(["sign_damaged", "sign_missing", "manual"]),
        note: z.string().max(500).optional(),
        // URL of an image previously uploaded via /uploads/. The mobile app
        // POSTs the photo first, gets back a URL, then includes it here on
        // close. Server validates the URL is on our own /uploads path so
        // a malicious client can't inject an arbitrary external link.
        // Accept either a relative /uploads/close-photos/... path (local
        // storage) or an absolute https URL on our R2 bucket. Anything else
        // is rejected so a malicious client can't inject an arbitrary URL.
        closePhotoUrl: z.string()
          .regex(/^(\/uploads\/close-photos\/[A-Za-z0-9._-]+|https:\/\/[A-Za-z0-9.-]+\/close-photos\/[A-Za-z0-9._-]+)$/)
          .optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });

    const [alert] = await db
      .select({ hangerId: schema.alerts.hangerId })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.id, id), eq(schema.alerts.organisationId, c.orgId)))
      .limit(1);
    if (!alert) return reply.code(404).send({ error: "not_found" });

    await closeAlertForHanger(alert.hangerId, body.data.reason, c.sub, body.data.note);

    // Persist the photo URL on the closed alert if one was supplied.
    // Done as a post-update because closeAlertForHanger doesn't know about
    // the photo (keeps the alert-flow service generic).
    if (body.data.closePhotoUrl) {
      await db
        .update(schema.alerts)
        .set({ closePhotoUrl: body.data.closePhotoUrl })
        .where(and(eq(schema.alerts.id, id), eq(schema.alerts.organisationId, c.orgId)));
    }

    if (body.data.reason === "sign_damaged" || body.data.reason === "sign_missing") {
      await db
        .update(schema.hangers)
        .set({ status: "out_of_service" })
        .where(and(eq(schema.hangers.id, alert.hangerId), eq(schema.hangers.organisationId, c.orgId)));

      const [reporter] = await db
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, c.sub))
        .limit(1);
      const [zone] = await db
        .select({ zoneName: schema.zones.name, floorName: schema.floors.name })
        .from(schema.hangers)
        .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
        .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
        .where(eq(schema.hangers.id, alert.hangerId))
        .limit(1);
      const where = [zone?.floorName, zone?.zoneName].filter(Boolean).join(" — ") || "(unassigned hanger)";
      const reasonLabel = body.data.reason === "sign_damaged" ? "damaged" : "missing";

      const recipients = await db
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(and(eq(schema.users.organisationId, c.orgId), isNull(schema.users.deactivatedAt)));

      for (const u of recipients) {
        if (u.role !== "admin" && u.role !== "supervisor") continue;
        const ctxN = {
          orgId: c.orgId,
          alertId: id,
          userId: u.id,
          title: `Sign ${reasonLabel} — ${where}`,
          body: `${reporter?.name ?? "A cleaner"} reported the sign as ${reasonLabel}${body.data.note ? `. Note: ${body.data.note}` : ""}.`,
          kind: "sign_replacement_needed" as const,
        };
        await notifyPush(ctxN);
        await notifyEmail(ctxN);
      }
    }
    return { ok: true };
  });
}
