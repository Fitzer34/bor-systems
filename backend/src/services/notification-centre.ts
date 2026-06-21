/**
 * Notifications centre — generate per-user notifications + fan out to channels.
 *
 *   createNotification(...)  → inserts a user_notifications row (the in-app feed),
 *                              publishes a `notification.created` live event, then
 *                              fans out to email / sms per the user's prefs.
 *   notifyOrgRole(...)       → createNotification for every active user in an org
 *                              holding one of the given roles (the reminder-job
 *                              recipient pattern, but per-user not just email).
 *   getPrefs / setPrefs      → read/write a user's per-event-type channel choices.
 *
 * The existing `notifications` table is a delivery LOG and is left untouched.
 * Email goes via sendEmailToUser; SMS via notifySms (Twilio). In-app is always
 * on (the row itself) so the bell icon never misses anything.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { eventBus } from "./event-bus.js";
import { sendEmailToUser, notifySms } from "./notifications.js";

export type Role = typeof schema.userRole.enumValues[number];

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  type: string;       // event type, e.g. "spill.open", "wo.overdue"
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
}

export interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

/**
 * Default channel routing per event type. in_app is always on. A few important
 * events default email on too; the rest are in-app only until a user opts in.
 * Unknown event types fall back to FALLBACK_PREFS.
 */
const FALLBACK_PREFS: ChannelPrefs = { inApp: true, email: false, sms: false };

export const DEFAULT_PREFS: Record<string, ChannelPrefs> = {
  "spill.open":        { inApp: true, email: false, sms: false },
  "spill.escalated":   { inApp: true, email: true,  sms: false },
  "ppm.overdue":       { inApp: true, email: true,  sms: false },
  "wo.overdue":        { inApp: true, email: true,  sms: false },
  "part.low_stock":    { inApp: true, email: false, sms: false },
  "cert.expiring":     { inApp: true, email: true,  sms: false },
  "invoice.overdue":   { inApp: true, email: true,  sms: false },
  "lone_worker.overdue": { inApp: true, email: true, sms: true },
  "quote.awaiting_approval": { inApp: true, email: true, sms: false },
  "patrol.missed":     { inApp: true, email: true,  sms: false },
};

function defaultPrefFor(eventType: string): ChannelPrefs {
  return DEFAULT_PREFS[eventType] ?? FALLBACK_PREFS;
}

/** Effective channel prefs for a user + event type: stored row, else defaults. */
export async function getPrefs(userId: string, eventType: string): Promise<ChannelPrefs> {
  const [row] = await db
    .select()
    .from(schema.notificationPreferences)
    .where(and(eq(schema.notificationPreferences.userId, userId), eq(schema.notificationPreferences.eventType, eventType)))
    .limit(1);
  if (!row) return defaultPrefFor(eventType);
  return { inApp: row.inApp, email: row.email, sms: row.sms };
}

/**
 * All of a user's preference rows, merged over the DEFAULT_PREFS catalogue so
 * the UI always sees every known event type (stored overrides win).
 */
export async function getAllPrefs(userId: string): Promise<Record<string, ChannelPrefs>> {
  const rows = await db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId));
  const out: Record<string, ChannelPrefs> = {};
  for (const [type, pref] of Object.entries(DEFAULT_PREFS)) out[type] = { ...pref };
  for (const r of rows) out[r.eventType] = { inApp: r.inApp, email: r.email, sms: r.sms };
  return out;
}

/** Upsert a user's channel prefs for one event type. */
export async function setPrefs(
  orgId: string,
  userId: string,
  eventType: string,
  prefs: Partial<ChannelPrefs>,
): Promise<ChannelPrefs> {
  const current = await getPrefs(userId, eventType);
  const next: ChannelPrefs = {
    inApp: prefs.inApp ?? current.inApp,
    email: prefs.email ?? current.email,
    sms: prefs.sms ?? current.sms,
  };
  await db
    .insert(schema.notificationPreferences)
    .values({ organisationId: orgId, userId, eventType, inApp: next.inApp, email: next.email, sms: next.sms })
    .onConflictDoUpdate({
      target: [schema.notificationPreferences.userId, schema.notificationPreferences.eventType],
      set: { inApp: next.inApp, email: next.email, sms: next.sms },
    });
  return next;
}

/**
 * Generate a notification for a single user. Always inserts the in-app row +
 * publishes a live event; additionally sends email / sms per the user's prefs.
 * Best-effort on the side channels — a failed email never throws here.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const [row] = await db
    .insert(schema.userNotifications)
    .values({
      organisationId: input.orgId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })
    .returning({ id: schema.userNotifications.id });

  const notificationId = row!.id;

  // Live event so the bell icon updates without a poll.
  eventBus.publish(input.orgId, {
    type: "notification.created",
    notificationId,
    userId: input.userId,
  });

  // Side channels per the user's prefs (in-app already persisted above).
  try {
    const prefs = await getPrefs(input.userId, input.type);
    if (prefs.email) {
      const [u] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, input.userId))
        .limit(1);
      if (u?.email) await sendEmailToUser(u.email, input.title, input.body);
    }
    if (prefs.sms) {
      await notifySms({
        orgId: input.orgId,
        alertId: input.entityType === "alert" ? input.entityId ?? null : null,
        userId: input.userId,
        title: input.title,
        body: input.body,
        kind: "alert",
      });
    }
  } catch (err) {
    console.error("notification-centre fan-out failed:", err);
  }

  return notificationId;
}

/**
 * Generate a notification for every active user in an org whose role is in
 * `roles`. Reuses the active-staff recipient query the reminder jobs use.
 */
export async function notifyOrgRole(
  orgId: string,
  roles: Role[],
  input: Omit<CreateNotificationInput, "orgId" | "userId">,
): Promise<void> {
  const recipients = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.organisationId, orgId),
      inArray(schema.users.role, roles),
      isNull(schema.users.deactivatedAt),
    ));
  for (const r of recipients) {
    await createNotification({ orgId, userId: r.id, ...input });
  }
}
