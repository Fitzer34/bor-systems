/**
 * Sentry initialisation for the web SPA.
 *
 * Set VITE_SENTRY_DSN at build time on Render. If unset (local dev),
 * everything is a no-op and the bundle stays small (Sentry's tree-shake
 * still includes the runtime but doesn't connect).
 */

import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const env = (import.meta.env.VITE_SENTRY_ENV as string | undefined)
  ?? (import.meta.env.MODE === "production" ? "production" : "development");

export function initWebSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: env,
    release: (import.meta.env.VITE_RELEASE as string | undefined) ?? "0.1.0",
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}

export { Sentry };
