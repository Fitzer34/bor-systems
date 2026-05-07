import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { broadcastToOnDutyCleaners, escalateAlert } from "./alert-flow.js";
import {
  getAcknowledgementTimerMinutes,
  getExpectedCleaningTimeMinutes,
  getResolutionTimerMinutes,
} from "./system-settings.js";
import { notifyPush } from "./notifications.js";

const TICK_MS = 30_000;

export function startEscalationTimer(): NodeJS.Timeout {
  return setInterval(tick, TICK_MS).unref();
}

async function tick(): Promise<void> {
  const [resolutionMinutes, ackMinutes, cleaningMinutes] = await Promise.all([
    getResolutionTimerMinutes(),
    getAcknowledgementTimerMinutes(),
    getExpectedCleaningTimeMinutes(),
  ]);
  const now = Date.now();
  const ackCutoff = new Date(now - ackMinutes * 60_000);
  const resCutoff = new Date(now - resolutionMinutes * 60_000);
  const cleaningCutoff = new Date(now - cleaningMinutes * 60_000);

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

  // Cleaning-time reminder: alert acknowledged, not closed, ack'd > expectedCleaningTime ago, reminder not sent
  const cleaningReminders = await db
    .select({ id: schema.alerts.id, acknowledgedBy: schema.alerts.acknowledgedBy })
    .from(schema.alerts)
    .where(
      and(
        isNull(schema.alerts.closedAt),
        isNotNull(schema.alerts.acknowledgedAt),
        isNull(schema.alerts.cleaningReminderSentAt),
        lte(schema.alerts.acknowledgedAt, cleaningCutoff),
      ),
    );
  for (const a of cleaningReminders) {
    await db
      .update(schema.alerts)
      .set({ cleaningReminderSentAt: new Date() })
      .where(eq(schema.alerts.id, a.id));
    if (a.acknowledgedBy) {
      await notifyPush({
        alertId: a.id,
        userId: a.acknowledgedBy,
        title: "Time to put the sign back",
        body: `Your expected cleaning time of ${cleaningMinutes} min has passed. Please return the sign to the hanger when the area is dry.`,
        kind: "alert",
      });
    }
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
