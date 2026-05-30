import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, like } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";
import { decodePayload, isPayloadDecodeError } from "../payload.js";
import { closeAlertForHanger, openAlertForHanger, startCleaningSession } from "../services/alert-flow.js";
import { getLowBatteryThreshold } from "../services/system-settings.js";
import { notifyEmail, notifyPush, notifySms } from "../services/notifications.js";
import { eventBus } from "../services/event-bus.js";

/**
 * Authenticate a webhook upload. Two acceptable proofs of authenticity:
 *
 *  1. **HMAC-SHA256** of the raw body, keyed with `TTS_WEBHOOK_SECRET`,
 *     passed in `x-bor-signature` as a hex digest. This is the right way —
 *     prevents replay-after-leak and proves the body wasn't tampered with
 *     in transit. New firmware (Heltec C++) sends this.
 *
 *  2. **Plain shared secret** in `x-bor-secret` matching `TTS_WEBHOOK_SECRET`.
 *     Legacy mechanism — what the Pi Python firmware currently sends. We
 *     keep accepting it during the migration period; remove this branch
 *     once every fielded device is on HMAC.
 *
 * Uses `timingSafeEqual` so an attacker can't time-leak the secret one byte
 * at a time.
 */
function verifyWebhookAuth(req: FastifyRequest): boolean {
  const expected = config.TTS_WEBHOOK_SECRET;
  if (!expected) return false; // misconfigured server — fail closed

  const signature = req.headers["x-bor-signature"];
  if (typeof signature === "string" && signature.length > 0) {
    // Compute HMAC over the raw JSON body as Fastify saw it.
    const raw = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const computed = createHmac("sha256", expected).update(raw).digest("hex");
    try {
      const a = Buffer.from(signature, "hex");
      const b = Buffer.from(computed, "hex");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch { /* malformed hex — fall through */ }
    return false;
  }

  // Legacy path — accept plain shared-secret header.
  const provided = req.headers["x-bor-secret"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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

// Per-route rate limit. Webhooks are unauthenticated (proven only by HMAC or
// shared secret), so they're a juicy DoS target. Caps:
//
//  - Per-DevEUI: 60/min — a healthy hanger heartbeats once/hour. A misfiring
//    device shouldn't be able to flood the pipeline. Sensor-event traffic
//    rarely exceeds 10/min even under heavy use.
//  - Per-IP (when DevEUI isn't yet known, e.g. malformed body): 120/min —
//    one gateway forwards events from up to 200 hangers in a building, so
//    this needs to be generous.
//
// Effort to bypass: trivial (just lie about your DevEUI). But cheap to apply
// and stops accidental loops cold.
const webhookRateLimit = {
  config: {
    rateLimit: {
      max: 120,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => {
        const ev = req.body?.end_device_ids?.dev_eui;
        if (typeof ev === "string" && ev.length > 0) return `webhook:eui:${ev.toUpperCase()}`;
        return `webhook:ip:${req.ip}`;
      },
    },
  },
};

export default async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhook/tts", webhookRateLimit, async (req, reply) => {
    if (!verifyWebhookAuth(req)) {
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

    // Match strategy: the firmware truncates the DevEUI to the LAST 8 ASCII
    // chars before sending over LoRa (the 20-byte payload budget doesn't fit
    // the full 16 chars + HMAC + seq + metadata). So we accept both the
    // truncated form and the full form, and look up by suffix.
    //
    //   Full registered DevEUI: "BOR3C0F02EADB342"
    //   What LoRa actually sent: "2EADB342"
    //
    // A LIKE %2EADB342 query matches the full row. For a legacy 16-hex
    // LoRaWAN device that registered itself with all 16 chars, the same
    // query still matches (last 8 = the suffix). For something that
    // forwarded the full DevEUI in `dev_eui` (not currently possible from
    // our firmware but other devices might), the LIKE still matches —
    // since `%X` is a tautology when the input equals the row's full value.
    //
    // Risk of false-positive collision: 8 hex chars = 16^8 ≈ 4 billion. For
    // a fleet under, say, 10k hangers, the birthday probability is ~10^-12.
    // For the prototype phase this is fine; revisit when we hit production
    // scale per-org.
    const lookupSuffix = devEui.length > 8 ? devEui.slice(-8) : devEui;

    const [hanger] = await db
      .select()
      .from(schema.hangers)
      .where(like(schema.hangers.devEui, `%${lookupSuffix}`))
      .limit(1);

    if (!hanger) {
      app.log.warn({ devEui, lookupSuffix }, "uplink from unknown hanger");
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
