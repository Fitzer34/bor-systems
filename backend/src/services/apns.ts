/**
 * Apple Push Notification Service (APNs) sender.
 *
 * Sends pushes via the modern token-based HTTP/2 API.
 *
 * Required env vars (set in Render):
 *   APNS_TEAM_ID    — 10-char Apple Developer team ID (e.g. ABCDE12345)
 *   APNS_KEY_ID     — 10-char ID of your APNs auth key
 *   APNS_KEY_P8     — full contents of the .p8 file Apple gave you,
 *                     PEM-encoded, with real newlines or "\n" sequences
 *   APNS_TOPIC      — the iOS bundle ID (default: com.borsystems.app)
 *   APNS_PRODUCTION — "true" for App Store / TestFlight builds,
 *                     "false" (default) for development/sandbox builds
 *                     installed via Xcode.
 *
 * If any required var is missing this module reports `apns_not_configured`
 * and lets the rest of the notification pipeline carry on.
 */

import http2 from "node:http2";
import jwt from "jsonwebtoken";

const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_KEY_P8 = process.env.APNS_KEY_P8?.replace(/\\n/g, "\n");
const APNS_TOPIC = process.env.APNS_TOPIC ?? "com.borsystems.app";
const APNS_PRODUCTION = (process.env.APNS_PRODUCTION ?? "false").toLowerCase() === "true";

const APNS_HOST = APNS_PRODUCTION
  ? "https://api.push.apple.com"
  : "https://api.sandbox.push.apple.com";

export const apnsConfigured = Boolean(APNS_TEAM_ID && APNS_KEY_ID && APNS_KEY_P8);

let cachedJwt: { token: string; expiresAt: number } | null = null;

function getApnsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token;
  const token = jwt.sign(
    { iss: APNS_TEAM_ID!, iat: now },
    APNS_KEY_P8!,
    { algorithm: "ES256", header: { alg: "ES256", kid: APNS_KEY_ID!, typ: "JWT" } },
  );
  // Apple says JWTs must be regenerated at least once an hour; we refresh at 50 min.
  cachedJwt = { token, expiresAt: now + 50 * 60 };
  return token;
}

let client: http2.ClientHttp2Session | null = null;
function getClient(): http2.ClientHttp2Session {
  if (client && !client.closed && !client.destroyed) return client;
  client = http2.connect(APNS_HOST);
  client.on("error", () => { client = null; });
  client.on("close", () => { client = null; });
  return client;
}

export interface ApnsPayload {
  title: string;
  body: string;
  /** Optional extra data merged into the APS payload (key/value strings). */
  data?: Record<string, string>;
  /** Apple "thread-identifier" for grouping. */
  threadId?: string;
}

export async function sendApns(
  deviceToken: string,
  payload: ApnsPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!apnsConfigured) return { ok: false, error: "apns_not_configured" };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    let session: http2.ClientHttp2Session;
    try {
      session = getClient();
    } catch (e) {
      finish({ ok: false, error: `apns_connect: ${(e as Error).message}` });
      return;
    }

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      // Priority 10 = immediate. Required for the watch to wake and buzz.
      // Priority 5 = power-considerate, can defer — fine for FYI pings, not
      // for spill alerts. Apple docs: any user-visible alert should use 10.
      "apns-priority": "10",
      "authorization": `bearer ${getApnsJwt()}`,
      "content-type": "application/json",
    });

    let body = "";
    let status = 0;

    req.on("response", (h) => { status = Number(h[":status"]); });
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      if (status === 200) finish({ ok: true });
      else finish({ ok: false, error: `HTTP ${status}: ${body.slice(0, 200)}` });
    });
    req.on("error", (e) => finish({ ok: false, error: e.message }));

    // Set a 10s timeout so a hung connection doesn't keep the whole notification
    // pipeline waiting.
    setTimeout(() => finish({ ok: false, error: "apns_timeout" }), 10_000).unref();

    const apsPayload = {
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        badge: 1,
        // "time-sensitive" wakes the screen, bypasses Focus / Do Not Disturb
        // (when the user has allowed it in Settings), and crucially makes
        // the paired Apple Watch buzz and ping with the haptic rather than
        // silently logging the notification. Plain notifications get
        // suppressed on the watch when the iPhone is unlocked.
        "interruption-level": "time-sensitive",
        // Apple Watch reads this for the prominent title on the watch face.
        ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
      },
      ...(payload.data ?? {}),
    };

    req.end(JSON.stringify(apsPayload));
  });
}
