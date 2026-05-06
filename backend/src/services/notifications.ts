import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import nodemailer, { type Transporter } from "nodemailer";
import twilio, { type Twilio } from "twilio";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";

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
  alertId: string | null;
  userId: string;
  title: string;
  body: string;
  kind: typeof schema.notificationKind.enumValues[number];
}

async function record(input: DispatchInput, channel: typeof schema.notificationChannel.enumValues[number], delivered: boolean, error?: string) {
  await db.insert(schema.notifications).values({
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
  if (!fcmReady()) {
    await record(input, "push", false, "fcm_not_configured");
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
