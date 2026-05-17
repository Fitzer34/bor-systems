import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyEmail, notifyPush, notifySms } from "./notifications.js";
import { eventBus } from "./event-bus.js";

// Any open alert older than this is considered stale at the moment of the
// next lift event — we force-close it and open a fresh alert. Stops "the
// first lift after a few hours doesn't fire a notification" UX bug from
// stale state lingering between the 30-second escalation-timer ticks.
const STALE_OPEN_ALERT_MS = 2 * 60 * 60 * 1000;

export async function openAlertForHanger(hangerId: string): Promise<string | null> {
  const [hanger] = await db
    .select()
    .from(schema.hangers)
    .where(eq(schema.hangers.id, hangerId))
    .limit(1);
  if (!hanger) return null;

  const [existing] = await db
    .select({ id: schema.alerts.id, openedAt: schema.alerts.openedAt })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)))
    .limit(1);

  if (existing) {
    const ageMs = Date.now() - existing.openedAt.getTime();
    if (ageMs <= STALE_OPEN_ALERT_MS) {
      // Recent — absorb the lift event into the existing alert.
      return existing.id;
    }
    // Stale — close it before opening a new one. Otherwise the next lift
    // gets silently absorbed and the user sees no notification.
    await db
      .update(schema.alerts)
      .set({ status: "closed", closedAt: new Date(), closureReason: "manual" })
      .where(eq(schema.alerts.id, existing.id));
    eventBus.publish(hanger.organisationId, { type: "alert.closed", alertId: existing.id, reason: "manual" });
  }

  const [alert] = await db
    .insert(schema.alerts)
    .values({ organisationId: hanger.organisationId, hangerId, status: "open" })
    .returning({ id: schema.alerts.id });

  await broadcastToOnDutyCleaners(hanger.organisationId, alert!.id, "alert");
  eventBus.publish(hanger.organisationId, {
    type: "alert.open",
    alertId: alert!.id,
    zoneId: hanger.zoneId ?? null,
  });
  return alert!.id;
}

export async function closeAlertForHanger(
  hangerId: string,
  reason: typeof schema.closureReason.enumValues[number],
  closedBy: string | null,
  note?: string,
): Promise<void> {
  const closed = await db
    .update(schema.alerts)
    .set({
      status: "closed",
      closedAt: new Date(),
      closureReason: reason,
      closedBy,
      closureNote: note,
    })
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)))
    .returning({ id: schema.alerts.id, organisationId: schema.alerts.organisationId });
  for (const a of closed) {
    eventBus.publish(a.organisationId, { type: "alert.closed", alertId: a.id, reason });
  }
}

export async function broadcastToOnDutyCleaners(
  orgId: string,
  alertId: string,
  kind: typeof schema.notificationKind.enumValues[number],
): Promise<void> {
  // Simple, reliable rule: every on-duty user in the org gets pinged.
  // The old "cleaners-only with admin fallback" logic was a constant source
  // of "I got one push then nothing" complaints because the audience kept
  // flipping as users changed role or on-duty state.
  //
  // To opt out of pings, toggle yourself off-duty.
  const audience = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.organisationId, orgId),
      eq(schema.users.onDuty, true),
      isNull(schema.users.deactivatedAt),
    ));

  for (const u of audience) {
    await notifyPush({
      orgId,
      alertId,
      userId: u.id,
      title: "🚨 Spill alert",
      body: "A wet floor sign has been lifted. Tap to respond.",
      kind,
    });
  }
}

/**
 * Called when a cleaner presses the physical button on the hanger (Pi sends
 * `cleaning_started` event). Cleaning mode starts here and only ends when
 * the sign is replaced on the hanger (which closes the alert via the normal
 * `returned` event flow). No toggle, no second press — sign-return is the
 * end-of-cleaning signal.
 *
 *   1. No open alert → create a planned-cleaning alert (blue pin appears).
 *   2. Planned-cleaning alert already open → no-op (cleaning already on).
 *   3. Spill alert open (sign got lifted unexpectedly first) → flip it from
 *      "open" to "acknowledged" so the dashboards stop showing red.
 *
 * No push goes out — this is a "show on the dashboard" event, not a
 * "wake up the team" event.
 */
export async function startCleaningSession(hangerId: string): Promise<void> {
  const [hanger] = await db
    .select()
    .from(schema.hangers)
    .where(eq(schema.hangers.id, hangerId))
    .limit(1);
  if (!hanger) return;

  const [existing] = await db
    .select({
      id: schema.alerts.id,
      status: schema.alerts.status,
      kind: schema.alerts.kind,
    })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)))
    .limit(1);

  if (existing) {
    // Already in cleaning mode (or any acknowledged state) → leave it alone.
    if (existing.status === "acknowledged") return;
    // Spill alert in progress — promote to acknowledged so the dashboards
    // stop showing the red urgent state.
    await db
      .update(schema.alerts)
      .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: null })
      .where(eq(schema.alerts.id, existing.id));
    eventBus.publish(hanger.organisationId, { type: "alert.acknowledged", alertId: existing.id });
    return;
  }

  // No open alert: this is the planned-cleaning case. Create a fresh alert
  // pre-acknowledged and tagged as `planned_cleaning` so the Active alerts
  // list filters it out — it only shows as a blue pin on the floor plan.
  const now = new Date();
  const [alert] = await db
    .insert(schema.alerts)
    .values({
      organisationId: hanger.organisationId,
      hangerId,
      status: "acknowledged",
      kind: "planned_cleaning",
      openedAt: now,
      acknowledgedAt: now,
      acknowledgedBy: null,
    })
    .returning({ id: schema.alerts.id });

  eventBus.publish(hanger.organisationId, { type: "alert.acknowledged", alertId: alert!.id });
}

export async function escalateAlert(alertId: string): Promise<void> {
  const [alert] = await db.select().from(schema.alerts).where(eq(schema.alerts.id, alertId)).limit(1);
  if (!alert) return;
  await db
    .update(schema.alerts)
    .set({ escalatedAt: new Date() })
    .where(eq(schema.alerts.id, alertId));

  const supervisors = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.organisationId, alert.organisationId),
      eq(schema.users.role, "supervisor"),
      eq(schema.users.onDuty, true),
      isNull(schema.users.deactivatedAt),
    ));

  for (const s of supervisors) {
    const ctxN = { orgId: alert.organisationId, alertId, userId: s.id, title: "ESCALATED spill alert", body: "Sign not returned within timer.", kind: "escalation" as const };
    await notifyPush(ctxN);
    await notifySms(ctxN);
    await notifyEmail(ctxN);
  }
  await broadcastToOnDutyCleaners(alert.organisationId, alertId, "rebroadcast");
  eventBus.publish(alert.organisationId, { type: "alert.escalated", alertId });
}
