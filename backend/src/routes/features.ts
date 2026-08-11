/**
 * Per-organisation feature flags — the client-tailoring seam.
 *
 *   GET /settings/features   any signed-in user (the nav reads it)
 *   PUT /settings/features   admin only
 *
 * Every module defaults ON; an admin (or HazardLink onboarding a client)
 * switches off what that client doesn't buy or doesn't want, and the web
 * sidebar + dashboards hide it. Unknown keys are preserved so newer clients
 * don't wipe older flags. Stored in the settings key-value table.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";

const SETTINGS_KEY = "features";

/** The tailorable modules. Everything defaults to true. */
export const FEATURE_KEYS = [
  "cleaning",      // spill alerts, rounds, scheduling, devices
  "maintenance",   // work orders, PPM, assets, parts, meters
  "security",      // incidents, patrols, visitors, lone worker
  "timesheets",
  "forms",
  "permits",
  "compliance",
  "slas",
  "portal",        // client portal links
  "billing",
  "sds",           // safety data sheets
  "assistant",     // Ask HazardLink
] as const;

export type FeatureMap = Record<string, boolean>;

export async function getFeatures(orgId: string): Promise<FeatureMap> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.organisationId, orgId), eq(schema.settings.key, SETTINGS_KEY)))
    .limit(1);
  const stored = (row?.value ?? {}) as Record<string, unknown>;
  const out: FeatureMap = {};
  for (const k of FEATURE_KEYS) out[k] = stored[k] === false ? false : true;
  return out;
}

export default async function featureRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/features", { preHandler: [app.authenticate] }, async (req) => {
    const c = ctx(req);
    return { features: await getFeatures(c.orgId) };
  });

  const requireAdmin = async (req: any, reply: any) => {
    if (req.user?.role !== "admin") return reply.code(403).send({ error: "forbidden" });
  };

  const putBody = z.object({
    features: z.record(z.string(), z.boolean()),
  });
  app.put("/settings/features", { preHandler: [app.authenticate, requireAdmin] }, async (req, reply) => {
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    // Merge over what's stored: only known keys are honoured, unknown stored
    // keys survive (forward compatibility with newer flag sets).
    const [row] = await db
      .select()
      .from(schema.settings)
      .where(and(eq(schema.settings.organisationId, c.orgId), eq(schema.settings.key, SETTINGS_KEY)))
      .limit(1);
    const next = { ...((row?.value ?? {}) as Record<string, unknown>) };
    for (const [k, v] of Object.entries(parsed.data.features)) {
      if ((FEATURE_KEYS as readonly string[]).includes(k)) next[k] = v;
    }
    await db
      .insert(schema.settings)
      .values({ organisationId: c.orgId, key: SETTINGS_KEY, value: next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.settings.organisationId, schema.settings.key],
        set: { value: next, updatedAt: new Date() },
      });
    return { features: await getFeatures(c.orgId) };
  });
}
