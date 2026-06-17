import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmailToUser } from "./notifications.js";

/**
 * Daily maintenance reminder digest.
 *
 * Once a day, for each organisation, emails the admins/supervisors a summary of:
 *   • usage meters that are due (or due soon) for service, and
 *   • staff certifications that are expired or expiring within 60 days.
 *
 * One digest per org per calendar day (dedup via maintenance_reminder_log's
 * unique org+day index), so restarts or multiple ticks never double-send. The
 * dashboard tiles/panels are the always-on in-app channel; this is the push.
 */

const TICK_MS = 12 * 60 * 60 * 1000; // every 12 hours; the daily dedup gate does the rest
const METERS_URL = "https://app.hazardlink.ie/meters";
const COMPETENCY_URL = "https://app.hazardlink.ie/competency";

export function startMaintenanceReminderJob(): NodeJS.Timeout {
  setTimeout(() => { void tick(); }, 45_000).unref();
  return setInterval(() => { void tick(); }, TICK_MS).unref();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysUntil(dateISO: string, todayISOStr: string): number {
  return Math.round((Date.parse(dateISO + "T00:00:00Z") - Date.parse(todayISOStr + "T00:00:00Z")) / 86_400_000);
}

async function tick(): Promise<void> {
  try {
    const today = todayISO();
    const orgs = await db.select({ id: schema.organisations.id }).from(schema.organisations);

    for (const org of orgs) {
      // Meters due / due-soon (within 10% of the interval).
      const meters = await db
        .select()
        .from(schema.assetMeters)
        .where(and(eq(schema.assetMeters.organisationId, org.id), eq(schema.assetMeters.active, true)));
      const dueMeters = meters.filter((mtr) => {
        if (mtr.intervalValue == null) return false;
        const remaining = mtr.lastServiceValue + mtr.intervalValue - mtr.currentValue;
        return remaining <= Math.max(1, Math.round(mtr.intervalValue * 0.1));
      });

      // Certifications expired or expiring within 60 days.
      const certs = await db
        .select()
        .from(schema.staffCertifications)
        .where(eq(schema.staffCertifications.organisationId, org.id));
      const alertCerts = certs.filter((cert) => cert.expiresOn != null && daysUntil(cert.expiresOn, today) <= 60);

      if (dueMeters.length === 0 && alertCerts.length === 0) continue;

      // Dedup: claim today's slot for this org. If a row already exists, skip.
      const claimed = await db
        .insert(schema.maintenanceReminderLog)
        .values({ organisationId: org.id, sentOn: today })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0) continue;

      const recipients = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(and(
          eq(schema.users.organisationId, org.id),
          inArray(schema.users.role, ["admin", "supervisor"]),
          isNull(schema.users.deactivatedAt),
        ));
      if (recipients.length === 0) continue;

      const lines: string[] = ["Your HazardLink maintenance summary:", ""];
      if (dueMeters.length) {
        lines.push(`${dueMeters.length} meter${dueMeters.length === 1 ? "" : "s"} due for service:`);
        for (const mtr of dueMeters.slice(0, 10)) {
          lines.push(`• ${mtr.name} — current ${mtr.currentValue}${mtr.unit ? " " + mtr.unit : ""}`);
        }
        lines.push("", METERS_URL, "");
      }
      if (alertCerts.length) {
        lines.push(`${alertCerts.length} certification${alertCerts.length === 1 ? "" : "s"} expired or expiring soon:`);
        for (const cert of alertCerts.slice(0, 10)) {
          lines.push(`• ${cert.name} — ${daysUntil(cert.expiresOn!, today) < 0 ? "expired" : "expires"} ${cert.expiresOn}`);
        }
        lines.push("", COMPETENCY_URL);
      }
      const subject = `HazardLink: ${dueMeters.length} meter(s) due, ${alertCerts.length} cert(s) expiring`;
      const body = lines.join("\n");

      for (const r of recipients) {
        if (r.email) await sendEmailToUser(r.email, subject, body);
      }
    }
  } catch (err) {
    console.error("maintenance-reminder tick failed:", err);
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
