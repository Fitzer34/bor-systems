import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyEmail, notifyPush, notifySms } from "./notifications.js";
import { eventBus } from "./event-bus.js";

export async function openAlertForHanger(hangerId: string): Promise<string | null> {
  const [hanger] = await db
    .select()
    .from(schema.hangers)
    .where(eq(schema.hangers.id, hangerId))
    .limit(1);
  if (!hanger) return null;

  const existing = await db
    .select({ id: schema.alerts.id })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)))
    .limit(1);
  if (existing[0]) return existing[0].id;

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
 * `cleaning_started` event). Two scenarios:
 *
 *   1. Sign was already lifted and an alert is open (someone slipped, the
 *      sign got moved, etc.) → flip that alert from "open" to "acknowledged"
 *      so the dashboards stop showing it as urgent.
 *
 *   2. Sign is still on the hanger (no open alert) → create a fresh alert
 *      directly in "acknowledged" status. This is the *planned-cleaning*
 *      case: the cleaner is about to lift the sign deliberately to mark a
 *      wet floor while they clean. The blue pin shows on every dashboard
 *      for the configured `expectedCleaningTimeMinutes` (or until the sign
 *      returns to the hanger, whichever comes first). Subsequent "lifted"
 *      events get absorbed by the existing open-alert guard, so no spurious
 *      spill alert fires when the cleaner actually takes the sign off.
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
    })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)))
    .limit(1);

  if (existing) {
    if (existing.status === "acknowledged") return; // already in-progress
    await db
      .update(schema.alerts)
      .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: null })
      .where(eq(schema.alerts.id, existing.id));
    eventBus.publish(hanger.organisationId, { type: "alert.acknowledged", alertId: existing.id });
    return;
  }

  // Planned-cleaning path: create the alert pre-acknowledged and tagged
  // as `planned_cleaning` so the Active alerts list can filter it out — it
  // only appears as a blue pin on the floor plan.
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
