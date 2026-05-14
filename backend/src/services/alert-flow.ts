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
 * Called when a cleaner presses the physical "I'm cleaning" button on the
 * hanger (Pi sends `cleaning_started` event). Flips the most-recently-opened
 * unclosed alert for that hanger from "open" to "acknowledged" and pings the
 * sender / on-duty admins so they know the spill is being handled.
 *
 * No-op if the hanger has no open alert.
 */
export async function acknowledgeAlertFromHardware(hangerId: string): Promise<void> {
  const [alert] = await db
    .select({
      id: schema.alerts.id,
      organisationId: schema.alerts.organisationId,
      status: schema.alerts.status,
    })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)))
    .limit(1);
  if (!alert) return;
  if (alert.status === "acknowledged") return;  // already there

  await db
    .update(schema.alerts)
    .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: null })
    .where(eq(schema.alerts.id, alert.id));

  // Ping on-duty admins/supervisors so they can see cleaning has started.
  const watchers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.organisationId, alert.organisationId),
      eq(schema.users.onDuty, true),
      isNull(schema.users.deactivatedAt),
    ));
  for (const w of watchers) {
    await notifyPush({
      orgId: alert.organisationId,
      alertId: alert.id,
      userId: w.id,
      title: "🧽 Cleaning in progress",
      body: "A cleaner has pressed the button on the hanger.",
      kind: "rebroadcast",
    });
  }

  eventBus.publish(alert.organisationId, { type: "alert.acknowledged", alertId: alert.id });
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
