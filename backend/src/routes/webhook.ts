import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";
import { decodePayload, isPayloadDecodeError } from "../payload.js";
import { closeAlertForHanger, openAlertForHanger } from "../services/alert-flow.js";

interface TtsUplink {
  end_device_ids: { dev_eui: string };
  uplink_message: { f_port: number; frm_payload: string };
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

    await db
      .update(schema.hangers)
      .set({
        batteryPct: decoded.batteryPct,
        firmwareVersion: decoded.firmwareVersion,
        lastSeenAt: new Date(),
      })
      .where(eq(schema.hangers.id, hanger.id));

    await db.insert(schema.events).values({
      hangerId: hanger.id,
      type: decoded.eventType,
      batteryPct: decoded.batteryPct,
      rawPayload: frmPayload,
    });

    if (hanger.status !== "active") {
      return reply.send({ status: "ok", hangerStatus: hanger.status });
    }

    if (decoded.eventType === "lifted") {
      await openAlertForHanger(hanger.id);
    } else if (decoded.eventType === "returned") {
      await closeAlertForHanger(hanger.id, "sign_returned", null);
    }

    return reply.send({ status: "ok" });
  });
}
