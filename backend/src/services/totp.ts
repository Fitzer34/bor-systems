/**
 * TOTP (RFC 6238) helpers — used for optional two-factor auth.
 *
 * Enrolment flow:
 *   1. POST /auth/2fa/enrol            → returns base32 secret + otpauth URL + QR data URL
 *   2. POST /auth/2fa/enrol/confirm    → user submits a 6-digit code from their authenticator;
 *                                         on match we promote totp_pending_secret → totp_secret
 *                                         and mint 10 recovery codes.
 *   3. POST /auth/2fa/disable          → user submits a current code or a recovery code; we clear
 *                                         totp_secret and recovery_codes.
 *
 * Sign-in flow (handled in routes/auth.ts):
 *   - /auth/login still takes email+password. If the user has totp_secret set,
 *     the response is { challenge: "totp", token: shortLivedJwt } instead of the
 *     usual session token. The client then POSTs the 6-digit code (or a
 *     recovery code) to /auth/login/2fa with that short-lived token to get a
 *     real session token.
 */

import { authenticator } from "otplib";
import QRCode from "qrcode";
import crypto from "node:crypto";

// 30-second window is the RFC default. ±1 window of clock skew tolerance,
// which is what most authenticator apps assume.
authenticator.options = { window: 1, step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(); // base32, 32 chars
}

export function otpauthUrl(args: { secret: string; email: string; issuer?: string }): string {
  const issuer = args.issuer ?? "Zero Slip Systems";
  return authenticator.keyuri(args.email, issuer, args.secret);
}

export async function qrDataUrl(otpauth: string): Promise<string> {
  return await QRCode.toDataURL(otpauth, { margin: 1, scale: 6 });
}

export function verifyTotp(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generate 10 one-time recovery codes. Each is 10 hex chars, grouped as
 * "xxxxx-xxxxx" so they're slightly less typo-prone on paper. The plain
 * codes are returned ONCE to the user; we only persist their argon2 hashes.
 */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}
