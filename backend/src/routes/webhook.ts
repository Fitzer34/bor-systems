import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";
import { decodePayload, isPayloadDecodeError } from "../payload.js";
import { closeAlertForHanger, openAlertForHanger, startCleaningSession } from "../services/alert-flow.js";
import { getLowBatteryThreshold } from "../services/system-settings.js";
import { notifyEmail, notifyPush, notifySms } from "../services/notifications.js";
import { eventBus } from "../services/event-bus.js";

interface TtsUplink {
  end_device_ids: { dev_eui: string };
  uplink_message: { f_port: number; frm_payload: string };
}

async function maybeFireLowBatteryAlert(
  orgId: string,
  hangerId: string,
  hangerLabel: string,
  oldPct: number | null,
  newPct: number,
): Promise<void> {
  const threshold = await getLowBatteryThreshold(orgId);
  const wasAbove = oldPct === null || oldPct > threshold;
  const nowBelow = newPct <= threshold;
  if (!wasAbove || !nowBelow) return;

  const adminAndSupervisors = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(and(eq(schema.users.organisationId, orgId), isNull(schema.users.deactivatedAt)));

  for (const u of adminAndSupervisors) {
    if (u.role !== "admin" && u.role !== "supervisor") continue;
    const ctxN = {
      orgId,
      alertId: null,
      userId: u.id,
      title: "Hanger battery low",
      body: `${hangerLabel} battery at ${newPct}% (threshold ${threshold}%)`,
      kind: "low_battery" as const,
    };
    await notifyPush(ctxN);
    await notifyEmail(ctxN);
  }
}

export default async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhook/tts", async (req, reply) => {
    const provided = req.headers["x-bor-secret"];
    if (provided !== config.TTS_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const body = req.body as TtsUplink | undefined;
    const devEui = body?.end_device_ids?.dev_eui?.toUpperCase();
    const frmPayload = body?.uplink_message?.frm_payload;
    if (!devEui || !frmPayload) {
      return reply.code(400).send({ error: "missing dev_eui or frm_payload" });
    }

    const bytes = Uint8Array.from(Buffer.from(frmPayload, "base64"));
    let decoded;
    try {
      decoded = decodePayload(bytes);
    } catch (err) {
      if (isPayloadDecodeError(err)) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }

    const [hanger] = await db
      .select()
      .from(schema.hangers)
      .where(eq(schema.hangers.devEui, devEui))
      .limit(1);

    if (!hanger) {
      app.log.warn({ devEui }, "uplink from unknown hanger");
      return reply.code(202).send({ status: "unknown_hanger" });
    }

    const oldBattery = hanger.batteryPct;

    await db
      .update(schema.hangers)
      .set({
        batteryPct: decoded.batteryPct,
        firmwareVersion: decoded.firmwareVersion,
        lastSeenAt: new Date(),
      })
      .where(eq(schema.hangers.id, hanger.id));

    await db.insert(schema.events).values({
      organisationId: hanger.organisationId,
      hangerId: hanger.id,
      type: decoded.eventType,
      batteryPct: decoded.batteryPct,
      rawPayload: frmPayload,
    });

    // Tell connected dashboards a hanger just phoned home so the Online
    // indicator updates instantly without waiting for the 30s poll.
    eventBus.publish(hanger.organisationId, {
      type: "hanger.updated",
      hangerId: hanger.id,
    });

    const hangerLabel = hanger.devEui;
    void maybeFireLowBatteryAlert(hanger.organisationId, hanger.id, hangerLabel, oldBattery, decoded.batteryPct);

    if (hanger.status !== "active") {
      return reply.send({ status: "ok", hangerStatus: hanger.status });
    }

    if (decoded.eventType === "lifted") {
      await openAlertForHanger(hanger.id);
    } else if (decoded.eventType === "returned") {
      await closeAlertForHanger(hanger.id, "sign_returned", null);
    } else if (decoded.eventType === "cleaning_started") {
      // Cleaner is at the hanger and pressed the button. Either:
      //   - flips an existing open alert to acknowledged, or
      //   - creates a fresh acknowledged alert (planned cleaning).
      // Either way, all dashboards immediately show "in progress" / blue pin
      // for that zone, and subsequent lifted events get absorbed by the
      // existing-open-alert guard.
      await startCleaningSession(hanger.id);
    }

    return reply.send({ status: "ok" });
  });
}
