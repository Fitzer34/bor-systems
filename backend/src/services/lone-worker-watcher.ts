import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmail } from "./notifications.js";
import { notifyOrgRole } from "./notification-centre.js";
import { dedupKeyFired } from "./notification-dedup.js";

/**
 * Lone-worker safety watcher. Every minute it finds active sessions whose
 * check-in is overdue and raises an alarm (status → alarm, reason
 * missed_check_in), emailing the org's admins + supervisors (the monitoring
 * hub). Panic alarms are raised directly by the route, which also calls
 * notifyLoneWorkerHub. The dashboard's monitoring view is the always-on channel.
 */

const TICK_MS = 60_000;

export function startLoneWorkerWatcher(): NodeJS.Timeout {
  setTimeout(() => { void tick(); }, 20_000).unref();
  return setInterval(() => { void tick(); }, TICK_MS).unref();
}

export async function notifyLoneWorkerHub(
  session: typeof schema.loneWorkerSessions.$inferSelect,
  workerName: string,
): Promise<void> {
  try {
    const recipients = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(and(
        eq(schema.users.organisationId, session.organisationId),
        inArray(schema.users.role, ["admin", "supervisor"]),
        isNull(schema.users.deactivatedAt),
      ));
    const reason = session.alarmReason === "panic" ? "PANIC / SOS" : "a missed safety check-in";
    const subject = `⚠️ Lone-worker alarm: ${workerName} — ${reason}`;
    const body = [
      `${workerName} has raised a lone-worker alarm (${reason}).`,
      ...(session.note ? ["", `They noted: "${session.note}"`] : []),
      "",
      `Started: ${session.startedAt.toISOString()}`,
      `Check-in interval: ${session.intervalMinutes} min`,
      "",
      `Open the dashboard to respond: https://app.hazardlink.ie/lone-worker`,
    ].join("\n");
    for (const r of recipients) {
      if (r.email) await sendEmail({ to: r.email, subject, text: body });
    }

    // Notifications-centre feed entry. Deduped on the session id so a panic
    // alarm + a later watcher pass for the same session don't double-post.
    if (await dedupKeyFired(session.organisationId, "lone_worker.overdue", session.id)) {
      await notifyOrgRole(session.organisationId, ["admin", "supervisor"], {
        type: "lone_worker.overdue",
        title: `Lone-worker alarm: ${workerName}`,
        body: `${workerName} raised a lone-worker alarm (${reason}).`,
        entityType: "lone_worker_session",
        entityId: session.id,
      });
    }
  } catch (err) {
    console.error("notifyLoneWorkerHub failed:", err);
  }
}

async function tick(): Promise<void> {
  try {
    const now = new Date();
    const overdue = await db
      .select()
      .from(schema.loneWorkerSessions)
      .where(and(
        eq(schema.loneWorkerSessions.status, "active"),
        lt(schema.loneWorkerSessions.nextCheckInDueAt, now),
      ));
    for (const s of overdue) {
      // Flip active → alarm atomically (the status guard prevents double-firing).
      const [updated] = await db
        .update(schema.loneWorkerSessions)
        .set({ status: "alarm", alarmReason: "missed_check_in", alarmAt: now })
        .where(and(eq(schema.loneWorkerSessions.id, s.id), eq(schema.loneWorkerSessions.status, "active")))
        .returning();
      if (!updated) continue;
      const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
      await notifyLoneWorkerHub(updated, u?.name ?? "A worker");
    }
  } catch (err) {
    console.error("lone-worker watcher tick failed:", err);
  }
}
