import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { broadcastToOnDutyCleaners, escalateAlert } from "./alert-flow.js";
import { eventBus } from "./event-bus.js";
import {
  getAcknowledgementTimerMinutes,
  getExpectedCleaningTimeMinutes,
  getResolutionTimerMinutes,
} from "./system-settings.js";
import { notifyPush } from "./notifications.js";

const TICK_MS = 30_000;

// Belt-and-braces: any alert older than this gets force-closed regardless of
// status. Stops stale alerts (returned event lost, app crashed mid-handling,
// admin forgot to manually close) from blocking the next fresh notification.
const STALE_ALERT_HOURS = 2;

export function startEscalationTimer(): NodeJS.Timeout {
  return setInterval(tick, TICK_MS).unref();
}

async function tick(): Promise<void> {
  const now = Date.now();

  // Process each org's open alerts independently (per-org timer settings)
  const orgs = await db.select({ id: schema.organisations.id }).from(schema.organisations);

  for (const org of orgs) {
    const [resolutionMinutes, ackMinutes, cleaningMinutes] = await Promise.all([
      getResolutionTimerMinutes(org.id),
      getAcknowledgementTimerMinutes(org.id),
      getExpectedCleaningTimeMinutes(org.id),
    ]);
    const ackCutoff = new Date(now - ackMinutes * 60_000);
    const resCutoff = new Date(now - resolutionMinutes * 60_000);
    const cleaningCutoff = new Date(now - cleaningMinutes * 60_000);

    // Ack timeout: nobody has tapped "I'm on it" — escalate to supervisors
    const ackTimeouts = await db
      .select({ id: schema.alerts.id })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.organisationId, org.id),
        isNull(schema.alerts.closedAt),
        isNull(schema.alerts.acknowledgedAt),
        isNull(schema.alerts.escalatedAt),
        lte(schema.alerts.openedAt, ackCutoff),
      ));
    for (const a of ackTimeouts) await escalateAlert(a.id);

    // Resolution timeout: sign still not physically returned — rebroadcast and escalate
    const resTimeouts = await db
      .select({ id: schema.alerts.id, escalatedAt: schema.alerts.escalatedAt })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.organisationId, org.id),
        isNull(schema.alerts.closedAt),
        eq(schema.alerts.rebroadcastCount, 0),
        lte(schema.alerts.openedAt, resCutoff),
      ));
    for (const a of resTimeouts) {
      await db.update(schema.alerts).set({ rebroadcastCount: 1 }).where(eq(schema.alerts.id, a.id));
      await broadcastToOnDutyCleaners(org.id, a.id, "rebroadcast");
      if (!a.escalatedAt) await escalateAlert(a.id);
    }

    // Cleaning-time reminder. We branch on whether the acknowledgement was
    // from a human (a user tapping "I'm on it" on their phone — acknowledgedBy
    // is set) or from the hardware "I'm cleaning" button (acknowledgedBy null
    // — this is a planned-cleaning session).
    //
    // For human acknowledgements: send them a reminder to put the sign back.
    // For hardware sessions: auto-close the alert so a forgotten cleaning
    // session doesn't sit blue on the dashboard forever.
    const cleaningReminders = await db
      .select({ id: schema.alerts.id, acknowledgedBy: schema.alerts.acknowledgedBy, hangerId: schema.alerts.hangerId })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.organisationId, org.id),
        isNull(schema.alerts.closedAt),
        isNotNull(schema.alerts.acknowledgedAt),
        isNull(schema.alerts.cleaningReminderSentAt),
        lte(schema.alerts.acknowledgedAt, cleaningCutoff),
      ));
    for (const a of cleaningReminders) {
      await db
        .update(schema.alerts)
        .set({ cleaningReminderSentAt: new Date() })
        .where(eq(schema.alerts.id, a.id));
      if (a.acknowledgedBy) {
        await notifyPush({
          orgId: org.id,
          alertId: a.id,
          userId: a.acknowledgedBy,
          title: "Time to put the sign back",
          body: `Your expected cleaning time of ${cleaningMinutes} min has passed. Please return the sign to the hanger when the area is dry.`,
          kind: "alert",
        });
      } else {
        // Planned-cleaning session has exceeded its window — auto-close so
        // the dashboard stops showing blue indefinitely. Cleaner can always
        // press the button again to start a fresh session.
        await db
          .update(schema.alerts)
          .set({ status: "closed", closedAt: new Date(), closureReason: "manual" })
          .where(eq(schema.alerts.id, a.id));
      }
    }

    // Stale-alert cleanup. Any alert that's been open for more than
    // STALE_ALERT_HOURS without resolution gets force-closed. The
    // common cause is a "returned" event that was lost (Pi was offline,
    // microswitch glitched) — without this cleanup, the stuck alert
    // would absorb the next genuine lift event and the user would
    // wonder why no notification fires.
    const staleCutoff = new Date(now - STALE_ALERT_HOURS * 60 * 60 * 1000);
    const stuck = await db
      .select({ id: schema.alerts.id })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.organisationId, org.id),
        isNull(schema.alerts.closedAt),
        lte(schema.alerts.openedAt, staleCutoff),
      ));
    for (const a of stuck) {
      await db
        .update(schema.alerts)
        .set({ status: "closed", closedAt: new Date(), closureReason: "manual" })
        .where(eq(schema.alerts.id, a.id));
      eventBus.publish(org.id, { type: "alert.closed", alertId: a.id, reason: "manual" });
    }
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
