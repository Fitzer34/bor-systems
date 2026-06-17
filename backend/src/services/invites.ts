import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmail } from "./notifications.js";

/**
 * Staff invite onboarding.
 *
 * When an admin adds a new staff member without setting a password, we email
 * them a secure one-time link — app.hazardlink.ie/accept-invite/<token> — where
 * they choose their own password and are dropped straight into the app, logged
 * in. This module owns minting the token, stamping the pending-invite state on
 * the user row, and sending the white-labelled email. It's used by both the
 * "Create user" flow and the "Resend invite" action (routes/users.ts).
 *
 * Security: the URL token is the only secret. We store ONLY its SHA-256 on the
 * user row, so a DB leak can't be used to accept an invite. The token carries
 * 24 random bytes (192 bits) of entropy, so a fast hash is the right tool — it's
 * not brute-forceable and we avoid an argon2 DoS on the public accept endpoint.
 */

// Same origin the rest of our magic links (PPM scheduling, quotes) point at.
const PUBLIC_BASE = "https://app.hazardlink.ie";
const EXPIRY_DAYS = 14;

export function inviteUrl(token: string): string {
  return `${PUBLIC_BASE}/accept-invite/${token}`;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Mint a fresh invite for an existing user row, stamp the pending state, and
 * email the link. Returns ok:true even when SMTP isn't configured / the send
 * fails — the row is still updated and the raw `url` is handed back so the admin
 * can copy the link and pass it on manually. `emailError` is the soft warning.
 */
export async function sendStaffInvite(opts: {
  userId: string;
  email: string;
  name: string;
  orgName: string;
  inviterName?: string | null;
}): Promise<{ ok: boolean; token: string; url: string; emailError?: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000);

  await db
    .update(schema.users)
    .set({
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: expiresAt,
      invitedAt: new Date(),
      inviteAcceptedAt: null,
    })
    .where(eq(schema.users.id, opts.userId));

  const url = inviteUrl(token);
  const who = opts.inviterName?.trim()
    ? `${opts.inviterName.trim()} at ${opts.orgName}`
    : opts.orgName;
  const subject = `You've been added to ${opts.orgName} on HazardLink`;
  const body = [
    `Hi ${opts.name},`,
    ``,
    `${who} has set up a HazardLink account for you.`,
    ``,
    `Tap the secure link below to choose a password and sign in. It opens the app with you already logged in:`,
    ``,
    url,
    ``,
    `This link is just for you and expires in ${EXPIRY_DAYS} days. If you weren't expecting this, you can safely ignore this email.`,
    ``,
    `— ${opts.orgName}`,
  ].join("\n");

  const send = await sendEmail({ to: opts.email, subject, text: body, fromName: opts.orgName });
  return { ok: true, token, url, emailError: send.ok ? undefined : send.error };
}
