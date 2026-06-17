/**
 * AI feature endpoints (Claude-powered). All gated on ANTHROPIC_API_KEY via
 * isAiConfigured() — they 503 when the key isn't set, exactly like /ai/scope.
 * Org-scoped + staff-only, matching who can create jobs/incidents.
 *
 *   POST /ai/parse-work-request   — voice/free-text → structured work order
 *   POST /ai/triage-incident      — suggest severity + immediate actions
 *   POST /ai/assets/:id/summary   — plain-English brief of an asset's history
 *
 * The scope-draft + quote-ranking endpoints live in maintenance.ts (kept there
 * to sit next to the job routes they serve); this module holds the newer,
 * cross-section AI features.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, desc, ilike } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import {
  isAiConfigured,
  parseWorkRequest,
  triageIncident,
  summariseAssetHistory,
  runDataAssistant,
  type AssistantToolDef,
} from "../services/ai.js";

const requireRole =
  (allowed: Array<(typeof schema.userRole.enumValues)[number]>) =>
  async (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };

export default async function aiRoutes(app: FastifyInstance): Promise<void> {
  const staff = requireRole(["admin", "supervisor"]);

  // ─── Voice / free-text → structured work request ───────────────────────────
  // The client transcribes speech on-device (or the user types), posts the raw
  // text, and gets back a structured draft to confirm before POST /jobs.
  const parseBody = z.object({ text: z.string().min(3).max(4000) });
  app.post("/ai/parse-work-request", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    if (!isAiConfigured()) return reply.code(503).send({ error: "ai_not_configured" });
    const parsed = parseBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);
    const [assets, buildings] = await Promise.all([
      db
        .select({ id: schema.assets.id, name: schema.assets.name })
        .from(schema.assets)
        .where(eq(schema.assets.organisationId, c.orgId))
        .limit(200),
      db
        .select({ id: schema.buildings.id, name: schema.buildings.name })
        .from(schema.buildings)
        .where(eq(schema.buildings.organisationId, c.orgId))
        .limit(200),
    ]);
    try {
      return await parseWorkRequest({
        text: parsed.data.text,
        assets,
        buildings,
        priorities: [...schema.jobPriority.enumValues],
      });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: "ai_failed" });
    }
  });

  // ─── Incident triage ───────────────────────────────────────────────────────
  // Runs on the draft before an incident is saved, so the suggested severity can
  // pre-fill the form. Returns a suggestion only — never auto-applies.
  const triageBody = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    kind: z.string().max(120).optional(),
  });
  app.post("/ai/triage-incident", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    if (!isAiConfigured()) return reply.code(503).send({ error: "ai_not_configured" });
    const parsed = triageBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    try {
      return await triageIncident({
        title: parsed.data.title,
        description: parsed.data.description,
        kind: parsed.data.kind,
        severities: [...schema.incidentSeverity.enumValues],
      });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: "ai_failed" });
    }
  });

  // ─── Asset history summary ─────────────────────────────────────────────────
  // Incidents are building-scoped (no asset FK), so an asset brief is built from
  // its maintenance jobs.
  app.post("/ai/assets/:id/summary", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    if (!isAiConfigured()) return reply.code(503).send({ error: "ai_not_configured" });
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [asset] = await db
      .select({ id: schema.assets.id, name: schema.assets.name })
      .from(schema.assets)
      .where(and(eq(schema.assets.id, id), eq(schema.assets.organisationId, c.orgId)))
      .limit(1);
    if (!asset) return reply.code(404).send({ error: "not_found" });

    const jobs = await db
      .select({
        title: schema.maintenanceJobs.title,
        status: schema.maintenanceJobs.status,
        completedAt: schema.maintenanceJobs.completedAt,
        note: schema.maintenanceJobs.completionNote,
      })
      .from(schema.maintenanceJobs)
      .where(and(eq(schema.maintenanceJobs.assetId, id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
      .orderBy(desc(schema.maintenanceJobs.createdAt))
      .limit(50);

    try {
      const summary = await summariseAssetHistory({
        assetName: asset.name,
        jobs: jobs.map((j) => ({
          title: j.title,
          status: j.status,
          completedAt: j.completedAt ? j.completedAt.toISOString() : null,
          note: j.note,
        })),
        incidents: [],
      });
      return { summary };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: "ai_failed" });
    }
  });

  // ─── Data assistant (ask-your-data chat) ───────────────────────────────────
  // Claude answers questions about the org's own data via DB-backed tools.
  const askBody = z.object({ question: z.string().min(2).max(2000) });
  app.post("/ai/ask", { preHandler: [app.authenticate, staff] }, async (req, reply) => {
    if (!isAiConfigured()) return reply.code(503).send({ error: "ai_not_configured" });
    const parsed = askBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const c = ctx(req);

    const tools: AssistantToolDef[] = [
      {
        name: "search_jobs",
        description:
          "Search maintenance work orders for this organisation. Optional filters: status (logged, scoped, tendering, awarded, scheduled, in_progress, completed, cancelled) and a free-text match on the title. Returns the most recent matches.",
        input_schema: {
          type: "object",
          properties: {
            status: { type: "string" },
            text: { type: "string" },
            limit: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
      {
        name: "search_incidents",
        description:
          "Search security incidents for this organisation. Optional filters: status (open, investigating, resolved) and severity (low, medium, high, critical).",
        input_schema: {
          type: "object",
          properties: {
            status: { type: "string" },
            severity: { type: "string" },
            limit: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
      {
        name: "get_asset_history",
        description: "Find an asset by partial name and return its details plus its recent maintenance jobs.",
        input_schema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        },
      },
      {
        name: "dashboard_counts",
        description:
          "Current counts for an overview: open jobs (not completed/cancelled), open incidents (not resolved), critical open incidents, and a breakdown of jobs by status. Use for 'how many' / 'what needs attention' questions.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
    ];

    const tally = (xs: string[]): Record<string, number> =>
      xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {} as Record<string, number>);

    const executeTool = async (name: string, args: any): Promise<unknown> => {
      if (name === "search_jobs") {
        const conds = [eq(schema.maintenanceJobs.organisationId, c.orgId)];
        if (typeof args?.status === "string" && args.status.trim())
          conds.push(eq(schema.maintenanceJobs.status, args.status.trim() as any));
        if (typeof args?.text === "string" && args.text.trim())
          conds.push(ilike(schema.maintenanceJobs.title, `%${args.text.trim()}%`));
        const limit = Math.min(Number(args?.limit) || 20, 50);
        return db
          .select({
            title: schema.maintenanceJobs.title,
            status: schema.maintenanceJobs.status,
            priority: schema.maintenanceJobs.priority,
            createdAt: schema.maintenanceJobs.createdAt,
            completedAt: schema.maintenanceJobs.completedAt,
          })
          .from(schema.maintenanceJobs)
          .where(and(...conds))
          .orderBy(desc(schema.maintenanceJobs.createdAt))
          .limit(limit);
      }
      if (name === "search_incidents") {
        const conds = [eq(schema.securityIncidents.organisationId, c.orgId)];
        if (typeof args?.status === "string" && args.status.trim())
          conds.push(eq(schema.securityIncidents.status, args.status.trim() as any));
        if (typeof args?.severity === "string" && args.severity.trim())
          conds.push(eq(schema.securityIncidents.severity, args.severity.trim() as any));
        const limit = Math.min(Number(args?.limit) || 20, 50);
        return db
          .select({
            title: schema.securityIncidents.title,
            kind: schema.securityIncidents.kind,
            severity: schema.securityIncidents.severity,
            status: schema.securityIncidents.status,
            createdAt: schema.securityIncidents.createdAt,
          })
          .from(schema.securityIncidents)
          .where(and(...conds))
          .orderBy(desc(schema.securityIncidents.createdAt))
          .limit(limit);
      }
      if (name === "get_asset_history") {
        const nm = String(args?.name ?? "").trim();
        if (!nm) return { found: false };
        const [asset] = await db
          .select()
          .from(schema.assets)
          .where(and(eq(schema.assets.organisationId, c.orgId), ilike(schema.assets.name, `%${nm}%`)))
          .limit(1);
        if (!asset) return { found: false };
        const jobs = await db
          .select({
            title: schema.maintenanceJobs.title,
            status: schema.maintenanceJobs.status,
            completedAt: schema.maintenanceJobs.completedAt,
          })
          .from(schema.maintenanceJobs)
          .where(and(eq(schema.maintenanceJobs.assetId, asset.id), eq(schema.maintenanceJobs.organisationId, c.orgId)))
          .orderBy(desc(schema.maintenanceJobs.createdAt))
          .limit(25);
        return {
          found: true,
          asset: { name: asset.name, category: asset.category, make: asset.make, model: asset.model },
          jobs,
        };
      }
      if (name === "dashboard_counts") {
        const jobs = await db
          .select({ status: schema.maintenanceJobs.status, priority: schema.maintenanceJobs.priority })
          .from(schema.maintenanceJobs)
          .where(eq(schema.maintenanceJobs.organisationId, c.orgId))
          .limit(2000);
        const incidents = await db
          .select({ status: schema.securityIncidents.status, severity: schema.securityIncidents.severity })
          .from(schema.securityIncidents)
          .where(eq(schema.securityIncidents.organisationId, c.orgId))
          .limit(2000);
        const openJobs = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
        const openIncidents = incidents.filter((i) => i.status !== "resolved");
        return {
          openJobs: openJobs.length,
          totalJobs: jobs.length,
          jobsByStatus: tally(jobs.map((j) => j.status)),
          openIncidents: openIncidents.length,
          criticalOpenIncidents: openIncidents.filter((i) => i.severity === "critical").length,
        };
      }
      return { error: "unknown_tool" };
    };

    try {
      const answer = await runDataAssistant({ question: parsed.data.question, tools, executeTool });
      return { answer };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: "ai_failed" });
    }
  });
}
