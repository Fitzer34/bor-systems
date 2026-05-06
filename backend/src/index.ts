import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { join } from "node:path";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import alertRoutes from "./routes/alerts.js";
import hangerRoutes from "./routes/hangers.js";
import userRoutes from "./routes/users.js";
import buildingRoutes from "./routes/buildings.js";
import reportRoutes from "./routes/reports.js";
import settingsRoutes from "./routes/settings.js";
import adminLogRoutes from "./routes/admin-logs.js";
import webhookRoutes from "./routes/webhook.js";
import { startEscalationTimer } from "./services/escalation-timer.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

async function main(): Promise<void> {
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });
  await app.register(sensible);
  await app.register(cors, { origin: true });
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

  app.get("/health", async () => ({ ok: true, version: "0.1.0" }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(alertRoutes);
  await app.register(hangerRoutes);
  await app.register(buildingRoutes);
  await app.register(reportRoutes);
  await app.register(settingsRoutes);
  await app.register(adminLogRoutes);
  await app.register(webhookRoutes);

  startEscalationTimer();

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
