import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmailToUser } from "./notifications.js";

/**
 * PPM reminder job.
 *
 * Every few hours it scans active PPM tasks and, for any that are within their
 * reminder lead window (or overdue), emails the org's admins + supervisors.
 *
 * Cadence:
 *   • due soon (within lead days) → at most one email every 3 days
 *   • overdue                     → one email per day until marked done
 *
 * Dedup is via `last_reminded_on` (one send per calendar day per task). The
 * dashboard's due/overdue badges + login banner read the same rows, so the
 * in-app channel works even when SMTP isn't configured.
 */

const TICK_MS = 6 * 60 * 60 * 1000; // every 6 hours
const DASHBOARD_URL = "https://app.hazardlink.ie/ppms";

export function startPpmReminderJob(): NodeJS.Timeout {
  // First sweep shortly after boot so a fresh deploy doesn't wait 6h.
  setTimeout(() => { void tick(); }, 30_000).unref();
  return setInterval(() => { void tick(); }, TICK_MS).unref();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Whole-day difference between two YYYY-MM-DD dates (toISO - fromISO).
function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (Date.parse(toISO + "T00:00:00Z") - Date.parse(fromISO + "T00:00:00Z")) / 86_400_000,
  );
}

function frequencyLabel(n: number): string {
  switch (n) {
    case 1: return "once a year";
    case 2: return "twice a year";
    case 3: return "3× a year";
    case 4: return "quarterly";
    case 6: return "every 2 months";
    case 12: return "monthly";
    default: return `${n}× a year`;
  }
}

async function tick(): Promise<void> {
  try {
    const today = todayISO();
    const tasks = await db.select().from(schema.ppms).where(eq(schema.ppms.active, true));

    for (const p of tasks) {
      if (!p.nextDueDate) continue;
      const daysUntil = daysBetween(today, p.nextDueDate);
      const overdue = daysUntil < 0;

      // Only act once inside the lead window (or overdue).
      if (daysUntil > p.reminderLeadDays) continue;

      // Cadence guard: overdue → daily; due-soon → at most every 3 days.
      if (p.lastRemindedOn) {
        const since = daysBetween(p.lastRemindedOn, today);
        const minGap = overdue ? 1 : 3;
        if (since < minGap) continue;
      }

      // Recipients: active admins + supervisors in the org with an email.
      const recipients = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(and(
          eq(schema.users.organisationId, p.organisationId),
          inArray(schema.users.role, ["admin", "supervisor"]),
          isNull(schema.users.deactivatedAt),
        ));

      const subject = overdue
        ? `PPM OVERDUE: ${p.title}`
        : daysUntil === 0
          ? `PPM due today: ${p.title}`
          : `PPM due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}: ${p.title}`;

      const lines: string[] = [
        overdue
          ? `The following planned maintenance is OVERDUE (was due ${p.nextDueDate}):`
          : `The following planned maintenance is due on ${p.nextDueDate}:`,
        "",
        `• Task: ${p.title}`,
        `• Frequency: ${frequencyLabel(p.frequencyPerYear)}`,
      ];
      if (p.contractorName) lines.push(`• Contractor: ${p.contractorName}`);
      if (p.contactPhone) lines.push(`• Phone: ${p.contactPhone}`);
      if (p.contactEmail) lines.push(`• Email: ${p.contactEmail}`);
      if (p.notes) lines.push(`• Notes: ${p.notes}`);
      lines.push("", `Open the dashboard to mark it done once complete:`, DASHBOARD_URL);
      const body = lines.join("\n");

      for (const r of recipients) {
        if (r.email) await sendEmailToUser(r.email, subject, body);
      }

      // Record that we processed this task today (dedup) regardless of email
      // delivery — the dashboard banner is the always-on channel.
      await db
        .update(schema.ppms)
        .set({ lastRemindedOn: today })
        .where(eq(schema.ppms.id, p.id));
    }
  } catch (err) {
    console.error("ppm-reminder tick failed:", err);
  }
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
