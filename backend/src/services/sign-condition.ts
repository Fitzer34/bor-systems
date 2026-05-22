/**
 * Sign-condition monitoring.
 *
 * Catches degraded signs/hangers before they cause user-visible failures.
 * Two patterns:
 *
 * 1. **Flapping hanger** — sign goes "lifted → returned → lifted → returned"
 *    rapidly. Usually a faulty Hall sensor or a degraded magnet glued to a
 *    cracked sign. Generates a "needs attention" notification.
 *
 * 2. **Stuck-open hanger** — the closure_reason history shows multiple
 *    "sign_damaged" or "sign_missing" closures in a row. Tag the sign for
 *    replacement.
 *
 * Runs once per hour.
 */

import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyPush } from "./notifications.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const LOOKBACK_HOURS = 24;
const FLAPPING_EVENT_THRESHOLD = 20;  // 20 lift/return cycles in 24h = flapping

export function startSignConditionWatcher(): NodeJS.Timeout {
  return setInterval(tick, CHECK_INTERVAL_MS).unref();
}

async function tick(): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  // ─── Pattern 1: flapping ─────────────────────────────────────────
  const flapping = await db
    .select({
      hangerId: schema.events.hangerId,
      orgId: schema.events.organisationId,
      eventCount: count(schema.events.id),
    })
    .from(schema.events)
    .where(and(
      gte(schema.events.receivedAt, since),
      sql`${schema.events.type} IN ('lifted', 'returned')`,
    ))
    .groupBy(schema.events.hangerId, schema.events.organisationId)
    .having(sql`COUNT(*) >= ${FLAPPING_EVENT_THRESHOLD}`);

  for (const f of flapping) {
    await notifyAdmins(
      f.orgId,
      "Hanger acting up",
      `A hanger reported ${f.eventCount} lift/return events in the last ${LOOKBACK_HOURS}h — possible faulty sensor or damaged sign. Check the hanger in Hangers → ${f.hangerId.slice(0, 8)}.`,
    );
  }

  // ─── Pattern 2: repeated damaged/missing closures ────────────────
  // If the same hanger has been closed with reason damaged or missing 3+
  // times in 24h, the SIGN itself is bad and needs replacement.
  const damaged = await db
    .select({
      hangerId: schema.alerts.hangerId,
      orgId: schema.alerts.organisationId,
      damageCount: count(schema.alerts.id),
    })
    .from(schema.alerts)
    .where(and(
      gte(schema.alerts.closedAt, since),
      sql`${schema.alerts.closureReason} IN ('sign_damaged', 'sign_missing')`,
    ))
    .groupBy(schema.alerts.hangerId, schema.alerts.organisationId)
    .having(sql`COUNT(*) >= 3`);

  for (const d of damaged) {
    await notifyAdmins(
      d.orgId,
      "Replace sign at hanger",
      `Hanger ${d.hangerId.slice(0, 8)} has been flagged damaged/missing ${d.damageCount} times in the last day. Replace the sign and check the magnet is intact.`,
    );
  }
}

async function notifyAdmins(orgId: string, title: string, body: string): Promise<void> {
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.organisationId, orgId),
      eq(schema.users.role, "admin"),
      sql`${schema.users.deactivatedAt} IS NULL`,
    ));
  for (const a of admins) {
    await notifyPush({
      orgId,
      alertId: null,
      userId: a.id,
      title,
      body,
      kind: "low_battery", // informational
    });
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
