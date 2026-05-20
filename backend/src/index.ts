import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { join } from "node:path";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import twoFactorRoutes from "./routes/two-factor.js";
import alertRoutes from "./routes/alerts.js";
import hangerRoutes from "./routes/hangers.js";
import userRoutes from "./routes/users.js";
import buildingRoutes from "./routes/buildings.js";
import reportRoutes from "./routes/reports.js";
import settingsRoutes from "./routes/settings.js";
import adminLogRoutes from "./routes/admin-logs.js";
import shiftRoutes from "./routes/shifts.js";
import dispatchRoutes from "./routes/dispatches.js";
import webhookRoutes from "./routes/webhook.js";
import eventsRoutes from "./routes/events.js";
import statusRoutes from "./routes/status.js";
import signTagRoutes from "./routes/sign-tags.js";
import { startEscalationTimer } from "./services/escalation-timer.js";
import { initSentry, Sentry, captureException } from "./services/observability.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

async function main(): Promise<void> {
  initSentry();

  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024, trustProxy: true });

  // ---- Security headers ----
  // CSP off here — the SPA is served from a different origin and the API
  // responses are JSON. The dangerous header to set is X-Content-Type-Options,
  // Referrer-Policy, etc. — all of which helmet defaults to safe values.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  // ---- Rate limiting ----
  // Global default: 300 req/min per IP. /auth/* gets a much tighter cap below.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    cache: 10_000,
    allowList: (req) => {
      // SSE stream is one long-lived request — don't rate-limit it.
      return req.url.startsWith("/events");
    },
    keyGenerator: (req) => {
      // Prefer the auth subject when present so a NAT'd office isn't all
      // limited as one IP. Fall back to IP when unauthenticated.
      try {
        const u = (req as any).user as { sub?: string } | undefined;
        if (u?.sub) return `u:${u.sub}`;
      } catch { /* not authed yet */ }
      return `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => ({
      error: "rate_limited",
      retryAfterSec: Math.ceil(ctx.ttl / 1000),
    }),
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: config.CORS_ORIGINS === "*" ? true : config.CORS_ORIGINS.split(",").map((s) => s.trim()),
    credentials: false,
  });
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: config.JWT_EXPIRY } });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
  await app.register(staticPlugin, {
    root: join(process.cwd(), "uploads"),
    prefix: "/uploads/",
    decorateReply: false,
  });

  app.decorate("authenticate", async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  // ---- Error handler — funnels uncaught route errors to Sentry ----
  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    // 4xx errors are usually client mistakes; don't pollute Sentry with them.
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) {
      captureException(err, {
        method: req.method,
        url: req.url,
        userId: (req as any).user?.sub,
        orgId: (req as any).user?.orgId,
      });
    }
    reply.code(status).send({ error: err.message || "internal_error" });
  });

  app.get("/health", async () => ({ ok: true, version: "0.1.0" }));

  await app.register(authRoutes);
  await app.register(twoFactorRoutes);
  await app.register(userRoutes);
  await app.register(alertRoutes);
  await app.register(hangerRoutes);
  await app.register(buildingRoutes);
  await app.register(reportRoutes);
  await app.register(settingsRoutes);
  await app.register(adminLogRoutes);
  await app.register(shiftRoutes);
  await app.register(dispatchRoutes);
  await app.register(webhookRoutes);
  await app.register(eventsRoutes);
  await app.register(statusRoutes);
  await app.register(signTagRoutes);

  startEscalationTimer();

  // Graceful shutdown — flushes Sentry events on SIGTERM (Render restarts).
  const shutdown = async (sig: string) => {
    app.log.info(`${sig} received — shutting down`);
    try {
      await app.close();
    } catch (e) { app.log.error(e); }
    try {
      await Sentry.close(2000);
    } catch { /* sentry may not be initialised */ }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error(err);
  captureException(err, { phase: "boot" });
  process.exit(1);
});
