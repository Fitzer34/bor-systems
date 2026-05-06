import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

const RESOLUTION_KEY = "resolution_timer_minutes";

export async function getResolutionTimerMinutes(): Promise<number> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, RESOLUTION_KEY)).limit(1);
  if (!row) return config.RESOLUTION_TIMER_MINUTES;
  const v = (row.value as { minutes?: unknown }).minutes;
  return typeof v === "number" && v > 0 ? v : config.RESOLUTION_TIMER_MINUTES;
}

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings/resolution-timer",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async () => {
      const minutes = await getResolutionTimerMinutes();
      return { minutes, default: config.RESOLUTION_TIMER_MINUTES };
    },
  );

  app.put(
    "/settings/resolution-timer",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z.object({ minutes: z.number().int().positive().max(720) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });

      const userId = (req.user as { sub: string }).sub;
      await db
        .insert(schema.settings)
        .values({ key: RESOLUTION_KEY, value: { minutes: body.data.minutes } })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: { minutes: body.data.minutes }, updatedAt: new Date() },
        });
      await db.insert(schema.auditLog).values({
        actorUserId: userId,
        action: "settings.resolution_timer_set",
        targetType: "setting",
        targetId: RESOLUTION_KEY,
        metadata: { minutes: body.data.minutes },
      });
      return { minutes: body.data.minutes };
    },
  );
}
