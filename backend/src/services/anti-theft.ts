/**
 * Sign-tag anti-theft / equipment tracking.
 *
 * Each wet floor sign costs €15-30 retail. Cleaning companies lose ~5-10%
 * of their signs every year — left behind at client sites, mistakenly
 * binned by other cleaners, stolen by builders, etc. Replacing a 200-sign
 * fleet costs €600-1200/year — a real number for a small business.
 *
 * Our sign tags advertise BLE constantly (~5 µA). Phones running the
 * BOR app and gateways with BLE both passively scan for them and POST
 * `signTag.lastSeenAt` updates to the cloud.
 *
 * This service runs once an hour and flags tags whose lastSeenAt is
 * older than the threshold — generating a "sign missing" notification
 * for admins. Free anti-theft on top of the precision-finding feature.
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyEmail, notifyPush } from "./notifications.js";

const MISSING_THRESHOLD_HOURS = 24;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function startAntiTheftWatcher(): NodeJS.Timeout {
  return setInterval(tick, CHECK_INTERVAL_MS).unref();
}

async function tick(): Promise<void> {
  const cutoff = new Date(Date.now() - MISSING_THRESHOLD_HOURS * 60 * 60 * 1000);

  // Find tags that have been seen at least once but haven't phoned home
  // since the cutoff. Tags never seen at all are excluded — they're not
  // missing, they're just unpaired.
  const missing = await db
    .select({
      tagId: schema.signTags.id,
      orgId: schema.signTags.organisationId,
      hangerId: schema.signTags.pairedHangerId,
      lastSeenAt: schema.signTags.lastSeenAt,
    })
    .from(schema.signTags)
    .where(and(
      sql`${schema.signTags.lastSeenAt} IS NOT NULL`,
      lt(schema.signTags.lastSeenAt, cutoff),
    ));

  if (missing.length === 0) return;

  // Group by org so we send one summary notification per org per check.
  const byOrg = new Map<string, typeof missing>();
  for (const t of missing) {
    const list = byOrg.get(t.orgId) ?? [];
    list.push(t);
    byOrg.set(t.orgId, list);
  }

  for (const [orgId, tags] of byOrg) {
    // Pick admins to notify.
    const admins = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(
        eq(schema.users.organisationId, orgId),
        eq(schema.users.role, "admin"),
        sql`${schema.users.deactivatedAt} IS NULL`,
      ));

    for (const a of admins) {
      const body = tags.length === 1
        ? "1 sign hasn't been seen in over 24 hours."
        : `${tags.length} signs haven't been seen in over 24 hours.`;
      await notifyPush({
        orgId,
        alertId: null,
        userId: a.id,
        title: "Possible missing sign",
        body,
        kind: "low_battery", // re-use the existing kind — informational notification
      });
      await notifyEmail({
        orgId,
        alertId: null,
        userId: a.id,
        title: "ZeroSlip — possible missing sign(s)",
        body: `${body}\n\nReview missing signs in the admin dashboard under Hangers.`,
        kind: "low_battery",
      });
    }
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
