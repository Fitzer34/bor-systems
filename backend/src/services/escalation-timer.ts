import { and, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { broadcastToOnDutyCleaners, escalateAlert } from "./alert-flow.js";
import { getAcknowledgementTimerMinutes, getResolutionTimerMinutes } from "./system-settings.js";

const TICK_MS = 30_000;

export function startEscalationTimer(): NodeJS.Timeout {
  return setInterval(tick, TICK_MS).unref();
}

async function tick(): Promise<void> {
  const [resolutionMinutes, ackMinutes] = await Promise.all([
    getResolutionTimerMinutes(),
    getAcknowledgementTimerMinutes(),
  ]);
  const now = Date.now();
  const ackCutoff = new Date(now - ackMinutes * 60_000);
  const resCutoff = new Date(now - resolutionMinutes * 60_000);

  // Ack timeout: nobody has tapped "I'm on it" — escalate to supervisors
  const ackTimeouts = await db
    .select({ id: schema.alerts.id })
    .from(schema.alerts)
    .where(
      and(
        isNull(schema.alerts.closedAt),
        isNull(schema.alerts.acknowledgedAt),
        isNull(schema.alerts.escalatedAt),
        lte(schema.alerts.openedAt, ackCutoff),
      ),
    );
  for (const a of ackTimeouts) await escalateAlert(a.id);

  // Resolution timeout: sign still not physically returned — rebroadcast and escalate if not already
  const resTimeouts = await db
    .select({ id: schema.alerts.id, escalatedAt: schema.alerts.escalatedAt })
    .from(schema.alerts)
    .where(
      and(
        isNull(schema.alerts.closedAt),
        eq(schema.alerts.rebroadcastCount, 0),
        lte(schema.alerts.openedAt, resCutoff),
      ),
    );
  for (const a of resTimeouts) {
    await db.update(schema.alerts).set({ rebroadcastCount: 1 }).where(eq(schema.alerts.id, a.id));
    await broadcastToOnDutyCleaners(a.id, "rebroadcast");
    if (!a.escalatedAt) await escalateAlert(a.id);
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
