/**
 * Per-(type, entity, day) dedup guard for generated notifications.
 *
 * Mirrors the reminder-job dedup pattern (maintenance_reminder_log): a row is
 * claimed via INSERT … ON CONFLICT DO NOTHING. The first caller for a given
 * (org, type, entityId, calendar-day) wins and gets `true`; every repeat tick
 * the same day gets `false` and should skip sending.
 *
 * Use this around the recurring-job notification sites (overdue WO, overdue PPM,
 * low stock, expiring cert, lone-worker overdue, missed patrol) so a watcher
 * that fires every minute/hour doesn't spam the same user all day.
 */

import { db, schema } from "../db/client.js";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns true if THIS call is the first to fire for (org, type, entityId) today
 * — i.e. you should go ahead and create the notification. Returns false if it
 * already fired today (skip). `entityId` may be null for org-wide events.
 */
export async function dedupKeyFired(
  orgId: string,
  type: string,
  entityId: string | null,
  day: string = todayISO(),
): Promise<boolean> {
  const dedupKey = `${type}|${entityId ?? "-"}|${day}`;
  const claimed = await db
    .insert(schema.notificationDedup)
    .values({ organisationId: orgId, dedupKey })
    .onConflictDoNothing()
    .returning();
  return claimed.length > 0;
}
