import type { FastifyInstance } from "fastify";
import { eventBus } from "../services/event-bus.js";

interface JwtPayload {
  sub: string;
  orgId: string;
  role: string;
}

export default async function eventsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Server-Sent Events stream of live updates for the caller's organisation.
   *
   * Browsers (EventSource) can't send custom headers, so we accept the JWT
   * via ?token=... query parameter for this endpoint only.
   */
  app.get("/events", async (req, reply) => {
    const token = (req.query as { token?: string })?.token;
    if (!token) return reply.code(401).send({ error: "missing_token" });

    let payload: JwtPayload;
    try {
      payload = app.jwt.verify<JwtPayload>(token);
    } catch {
      return reply.code(401).send({ error: "invalid_token" });
    }

    const orgId = payload.orgId;
    if (!orgId) return reply.code(401).send({ error: "no_org_in_token" });

    reply.raw.statusCode = 200;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering (Render)
    reply.raw.flushHeaders?.();

    // Initial hello — tells the client the stream is alive.
    reply.raw.write(`event: hello\ndata: {"orgId":"${orgId}"}\n\n`);

    const off = eventBus.subscribe(orgId, (event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    // Keepalive every 25 s so intermediaries don't drop the idle connection.
    const keepalive = setInterval(() => {
      try {
        reply.raw.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        // socket likely gone; the close handler will tidy up
      }
    }, 25_000);
    keepalive.unref?.();

    const cleanup = () => {
      clearInterval(keepalive);
      off();
    };

    reply.raw.on("close", cleanup);
    reply.raw.on("error", cleanup);

    // Tell Fastify we own the response now
    return reply;
  });
}
