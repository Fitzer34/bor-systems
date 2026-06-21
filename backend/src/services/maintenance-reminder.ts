import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmailToUser } from "./notifications.js";
import { notifyOrgRole } from "./notification-centre.js";
import { dedupKeyFired } from "./notification-dedup.js";

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

/**
 * Generate notifications-centre feed entries for an org's maintenance state:
 *   • overdue work orders (scheduled in the past, not completed/cancelled)
 *   • low-stock parts (stock_qty <= reorder_level, reorder_level > 0)
 *   • expiring / expired certifications (within 60 days)
 * Each item is deduped to once per (type, entity, day) so a frequent tick
 * doesn't spam. Goes to admins + supervisors (the maintenance hub).
 */
async function generateMaintenanceNotifications(orgId: string, today: string): Promise<void> {
  try {
    // Overdue work orders: a scheduled start in the past and still open.
    const overdueJobs = await db
      .select({ id: schema.maintenanceJobs.id, title: schema.maintenanceJobs.title })
      .from(schema.maintenanceJobs)
      .where(and(
        eq(schema.maintenanceJobs.organisationId, orgId),
        lt(schema.maintenanceJobs.scheduledStartAt, new Date()),
        not_completed_or_cancelled(),
      ));
    for (const j of overdueJobs) {
      if (await dedupKeyFired(orgId, "wo.overdue", j.id, today)) {
        await notifyOrgRole(orgId, ["admin", "supervisor"], {
          type: "wo.overdue",
          title: `Work order overdue: ${j.title}`,
          body: `The scheduled start for "${j.title}" has passed and it isn't complete.`,
          entityType: "job",
          entityId: j.id,
        });
      }
    }

    // Low-stock parts.
    const parts = await db
      .select({ id: schema.parts.id, name: schema.parts.name, stockQty: schema.parts.stockQty, reorderLevel: schema.parts.reorderLevel })
      .from(schema.parts)
      .where(eq(schema.parts.organisationId, orgId));
    for (const p of parts) {
      const low = p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel);
      if (!low) continue;
      if (await dedupKeyFired(orgId, "part.low_stock", p.id, today)) {
        await notifyOrgRole(orgId, ["admin", "supervisor"], {
          type: "part.low_stock",
          title: `Low stock: ${p.name}`,
          body: `${p.name} is at ${p.stockQty} (reorder level ${p.reorderLevel}).`,
          entityType: "part",
          entityId: p.id,
        });
      }
    }

    // Missed patrols: an active security checkpoint with no scan in the last
    // 24h. Light heuristic (no per-checkpoint schedule exists yet) — surfaces
    // "this tour point hasn't been visited today". Deduped per checkpoint/day.
    const securityCheckpoints = await db
      .select({ id: schema.checkpoints.id, name: schema.checkpoints.name })
      .from(schema.checkpoints)
      .where(and(
        eq(schema.checkpoints.organisationId, orgId),
        eq(schema.checkpoints.active, true),
        eq(schema.checkpoints.discipline, "security"),
      ));
    if (securityCheckpoints.length) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      for (const cp of securityCheckpoints) {
        const [recent] = await db
          .select({ id: schema.checkpointScans.id })
          .from(schema.checkpointScans)
          .where(and(
            eq(schema.checkpointScans.checkpointId, cp.id),
            gte(schema.checkpointScans.scannedAt, since),
          ))
          .limit(1);
        if (recent) continue; // scanned within the last 24h — fine
        if (await dedupKeyFired(orgId, "patrol.missed", cp.id, today)) {
          await notifyOrgRole(orgId, ["admin", "supervisor"], {
            type: "patrol.missed",
            title: `Patrol checkpoint missed: ${cp.name}`,
            body: `"${cp.name}" has not been scanned in the last 24 hours.`,
            entityType: "checkpoint",
            entityId: cp.id,
          });
        }
      }
    }

    // Expiring / expired certifications (within 60 days).
    const certs = await db
      .select()
      .from(schema.staffCertifications)
      .where(eq(schema.staffCertifications.organisationId, orgId));
    for (const cert of certs) {
      if (cert.expiresOn == null) continue;
      const d = daysUntil(cert.expiresOn, today);
      if (d > 60) continue;
      if (await dedupKeyFired(orgId, "cert.expiring", cert.id, today)) {
        await notifyOrgRole(orgId, ["admin", "supervisor"], {
          type: "cert.expiring",
          title: `Certification ${d < 0 ? "expired" : "expiring"}: ${cert.name}`,
          body: `${cert.name} ${d < 0 ? "expired" : "expires"} ${cert.expiresOn}.`,
          entityType: "certification",
          entityId: cert.id,
        });
      }
    }
  } catch (err) {
    console.error("maintenance notification generation failed:", err);
  }
}

// "status NOT IN (completed, cancelled)" expressed for the overdue-WO query.
function not_completed_or_cancelled() {
  return or(
    eq(schema.maintenanceJobs.status, "logged"),
    eq(schema.maintenanceJobs.status, "scoped"),
    eq(schema.maintenanceJobs.status, "tendering"),
    eq(schema.maintenanceJobs.status, "awarded"),
    eq(schema.maintenanceJobs.status, "scheduled"),
    eq(schema.maintenanceJobs.status, "in_progress"),
  );
}

async function tick(): Promise<void> {
  try {
    const today = todayISO();
    const orgs = await db.select({ id: schema.organisations.id }).from(schema.organisations);

    for (const org of orgs) {
      // ── Notifications-centre feed entries ────────────────────────────────
      // Per-item, deduped to once-per-(type, entity, day) so a 12-hourly tick
      // (and restarts) never double-post. Independent of the email digest below
      // (which is gated separately by maintenance_reminder_log, once/org/day).
      await generateMaintenanceNotifications(org.id, today);

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
