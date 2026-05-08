import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { notifyEmail, notifyPush, notifySms } from "./notifications.js";

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
  return alert!.id;
}

export async function closeAlertForHanger(
  hangerId: string,
  reason: typeof schema.closureReason.enumValues[number],
  closedBy: string | null,
  note?: string,
): Promise<void> {
  await db
    .update(schema.alerts)
    .set({
      status: "closed",
      closedAt: new Date(),
      closureReason: reason,
      closedBy,
      closureNote: note,
    })
    .where(and(eq(schema.alerts.hangerId, hangerId), isNull(schema.alerts.closedAt)));
}

export async function broadcastToOnDutyCleaners(
  orgId: string,
  alertId: string,
  kind: typeof schema.notificationKind.enumValues[number],
): Promise<void> {
  const cleaners = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.organisationId, orgId),
      eq(schema.users.role, "cleaner"),
      eq(schema.users.onDuty, true),
      isNull(schema.users.deactivatedAt),
    ));

  for (const c of cleaners) {
    await notifyPush({ orgId, alertId, userId: c.id, title: "Spill alert", body: "A wet floor sign has been lifted.", kind });
  }
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
}
