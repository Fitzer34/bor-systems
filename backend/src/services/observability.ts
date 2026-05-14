/**
 * Sentry initialisation.
 *
 * If SENTRY_DSN is unset (e.g. local dev), Sentry stays silent — initSentry()
 * is a no-op and captureException() drops events on the floor.
 *
 * On Render, set:
 *   SENTRY_DSN  = the project DSN from sentry.io
 *   SENTRY_ENV  = "production" | "staging" (defaults to NODE_ENV)
 */

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();
const environment = process.env.SENTRY_ENV?.trim() || process.env.NODE_ENV || "development";
const release = process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "0.1.0";

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log("[sentry] SENTRY_DSN not set — error reporting disabled");
    return;
  }
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: 0.05, // 5% of requests get a perf trace
    profilesSampleRate: 0.05,
    sendDefaultPii: false, // don't ship request bodies / headers by default
  });
  initialised = true;
  // eslint-disable-next-line no-console
  console.log(`[sentry] initialised (env=${environment}, release=${release})`);
}

export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(err, { extra: ctx });
}

export { Sentry };
