import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import nodemailer, { type Transporter } from "nodemailer";
import twilio, { type Twilio } from "twilio";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { sendApns, apnsConfigured } from "./apns.js";

let fcm: App | null = null;
let smtp: Transporter | null = null;
let sms: Twilio | null = null;

function fcmReady(): boolean {
  if (fcm) return true;
  if (!config.FCM_PROJECT_ID || !config.FCM_PRIVATE_KEY || !config.FCM_CLIENT_EMAIL) return false;
  fcm = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: config.FCM_PROJECT_ID,
      privateKey: config.FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
      clientEmail: config.FCM_CLIENT_EMAIL,
    }),
  });
  return true;
}

function smtpReady(): boolean {
  if (smtp) return true;
  if (!config.SMTP_HOST || !config.SMTP_PORT || !config.SMTP_FROM) return false;
  smtp = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER && config.SMTP_PASS ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return true;
}

function smsReady(): boolean {
  if (sms) return true;
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) return false;
  sms = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  return true;
}

interface DispatchInput {
  orgId: string;
  alertId: string | null;
  userId: string;
  title: string;
  body: string;
  kind: typeof schema.notificationKind.enumValues[number];
}

async function record(input: DispatchInput, channel: typeof schema.notificationChannel.enumValues[number], delivered: boolean, error?: string) {
  await db.insert(schema.notifications).values({
    organisationId: input.orgId,
    alertId: input.alertId,
    userId: input.userId,
    channel,
    kind: input.kind,
    delivered,
    error,
  });
}

async function loadUser(userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return u ?? null;
}

export async function notifyPush(input: DispatchInput): Promise<void> {
  const user = await loadUser(input.userId);
  if (!user?.pushToken) {
    await record(input, "push", false, "no_push_token");
    return;
  }

  // iOS device tokens are 64-char hex strings (32 bytes encoded). If the token
  // looks like that and APNs is configured, send via APNs. Otherwise fall back
  // to FCM (Android, or iOS if you're using Firebase Messaging).
  const isApnsToken = /^[0-9a-fA-F]{64}$/.test(user.pushToken);

  if (isApnsToken && apnsConfigured) {
    // Map the notification kind to a UNNotificationCategory identifier that
    // the iOS app has pre-registered with action buttons (Acknowledge / On
    // my way / Open). The Apple Watch picks these buttons up automatically.
    const category =
      input.kind === "dispatch"     ? "dispatch" :
      input.kind === "low_battery"  ? "battery"  :
      // alerts: spill_open / spill_resolved / overdue → all use the alert
      // category so the cleaner can ack from the watch with one tap.
      "alert";

    const result = await sendApns(user.pushToken, {
      title: input.title,
      body: input.body,
      threadId: input.kind,
      category,
      data: {
        ...(input.alertId ? { alertId: input.alertId } : {}),
        kind: input.kind,
      },
    });
    // APNs told us this token is dead — null it in the DB so we stop
    // wasting round-trips on every alert. The iOS app re-registers a fresh
    // token on next login (see ContentView.swift).
    if (result.tokenDead) {
      await db.update(schema.users)
        .set({ pushToken: null })
        .where(eq(schema.users.id, user.id));
    }
    await record(input, "push", result.ok, result.error);
    return;
  }

  if (!fcmReady()) {
    await record(input, "push", false, isApnsToken ? "apns_not_configured" : "fcm_not_configured");
    return;
  }
  try {
    await getMessaging().send({
      token: user.pushToken,
      notification: { title: input.title, body: input.body },
      data: input.alertId ? { alertId: input.alertId, kind: input.kind } : { kind: input.kind },
    });
    await record(input, "push", true);
  } catch (err) {
    await record(input, "push", false, String(err));
  }
}

export async function notifySms(input: DispatchInput): Promise<void> {
  const user = await loadUser(input.userId);
  if (!user?.phoneE164) {
    await record(input, "sms", false, "no_phone");
    return;
  }
  if (!smsReady()) {
    await record(input, "sms", false, "twilio_not_configured");
    return;
  }
  try {
    await sms!.messages.create({
      to: user.phoneE164,
      from: config.TWILIO_FROM_NUMBER!,
      body: `[BOR] ${input.title}\n${input.body}`,
    });
    await record(input, "sms", true);
  } catch (err) {
    await record(input, "sms", false, String(err));
  }
}

export async function notifyEmail(input: DispatchInput): Promise<void> {
  const user = await loadUser(input.userId);
  if (!user?.email) {
    await record(input, "email", false, "no_email");
    return;
  }
  if (!smtpReady()) {
    await record(input, "email", false, "smtp_not_configured");
    return;
  }
  try {
    await smtp!.sendMail({
      from: config.SMTP_FROM,
      to: user.email,
      subject: `[BOR] ${input.title}`,
      text: input.body,
    });
    await record(input, "email", true);
  } catch (err) {
    await record(input, "email", false, String(err));
  }
}
