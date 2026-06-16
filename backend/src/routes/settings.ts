import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import {
  SETTING_KEYS,
  getAcknowledgementTimerMinutes,
  getDefaultAudibleAlarm,
  getExpectedCleaningTimeMinutes,
  getLowBatteryThreshold,
  getResolutionTimerMinutes,
  setBool,
  setNumber,
} from "../services/system-settings.js";

const requireRole = (allowed: Array<typeof schema.userRole.enumValues[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

async function audit(req: any, action: string, key: string, metadata: Record<string, unknown>) {
  const c = ctx(req);
  await db.insert(schema.auditLog).values({
    organisationId: c.orgId,
    actorUserId: c.sub,
    action,
    targetType: "setting",
    targetId: key,
    metadata,
  });
}

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req) => {
      const c = ctx(req);
      const [resolutionMinutes, ackMinutes, lowBatteryThreshold, defaultAudibleAlarm, expectedCleaningMinutes] =
        await Promise.all([
          getResolutionTimerMinutes(c.orgId),
          getAcknowledgementTimerMinutes(c.orgId),
          getLowBatteryThreshold(c.orgId),
          getDefaultAudibleAlarm(c.orgId),
          getExpectedCleaningTimeMinutes(c.orgId),
        ]);
      return { resolutionMinutes, ackMinutes, lowBatteryThreshold, defaultAudibleAlarm, expectedCleaningMinutes };
    },
  );

  app.put(
    "/settings/resolution-timer",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z.object({ minutes: z.number().int().positive().max(720) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await setNumber(c.orgId, SETTING_KEYS.RESOLUTION_TIMER, body.data.minutes);
      await audit(req, "settings.resolution_timer_set", SETTING_KEYS.RESOLUTION_TIMER, { minutes: body.data.minutes });
      return { minutes: body.data.minutes };
    },
  );

  app.put(
    "/settings/ack-timer",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z.object({ minutes: z.number().int().positive().max(120) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await setNumber(c.orgId, SETTING_KEYS.ACKNOWLEDGEMENT_TIMER, body.data.minutes);
      await audit(req, "settings.ack_timer_set", SETTING_KEYS.ACKNOWLEDGEMENT_TIMER, { minutes: body.data.minutes });
      return { minutes: body.data.minutes };
    },
  );

  app.put(
    "/settings/low-battery-threshold",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z.object({ pct: z.number().int().min(1).max(99) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await setNumber(c.orgId, SETTING_KEYS.LOW_BATTERY_THRESHOLD, body.data.pct);
      await audit(req, "settings.low_battery_threshold_set", SETTING_KEYS.LOW_BATTERY_THRESHOLD, { pct: body.data.pct });
      return { pct: body.data.pct };
    },
  );

  app.put(
    "/settings/default-audible-alarm",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await setBool(c.orgId, SETTING_KEYS.DEFAULT_AUDIBLE_ALARM, body.data.enabled);
      await audit(req, "settings.default_audible_alarm_set", SETTING_KEYS.DEFAULT_AUDIBLE_ALARM, { enabled: body.data.enabled });
      return { enabled: body.data.enabled };
    },
  );

  app.put(
    "/settings/expected-cleaning-time",
    { preHandler: [app.authenticate, requireRole(["admin", "supervisor"])] },
    async (req, reply) => {
      const body = z.object({ minutes: z.number().int().positive().max(240) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      await setNumber(c.orgId, SETTING_KEYS.EXPECTED_CLEANING_TIME, body.data.minutes);
      await audit(req, "settings.expected_cleaning_time_set", SETTING_KEYS.EXPECTED_CLEANING_TIME, { minutes: body.data.minutes });
      return { minutes: body.data.minutes };
    },
  );

  // Rename the organisation. This name shows in the sidebar and is the sender
  // name + signature on every contractor email, so it's admin-only.
  app.put(
    "/settings/org-name",
    { preHandler: [app.authenticate, requireRole(["admin"])] },
    async (req, reply) => {
      const body = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_input" });
      const c = ctx(req);
      const name = body.data.name.trim();
      await db.update(schema.organisations).set({ name }).where(eq(schema.organisations.id, c.orgId));
      await audit(req, "settings.org_name_set", "org_name", { name });
      return { name };
    },
  );
}
