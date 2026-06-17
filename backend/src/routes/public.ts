/**
 * Public (unauthenticated) endpoints for tenant/visitor feedback.
 *
 * Each hanger has a printed QR code containing a URL like:
 *   https://bor-systems-backend.onrender.com/public/feedback/<hangerId>
 *
 * Building tenants, visitors, or passing facility staff can scan it to:
 *   - Confirm the area is dry now ("👍 area is dry")
 *   - Report it's still wet hours later ("👎 still wet")
 *   - Just see when the spill was first reported (transparency)
 *
 * The feedback gets attached to the most recent alert for that hanger and
 * surfaces in the admin dashboard. Generates real-time engagement +
 * shows the facility is responsive.
 *
 * Rate-limited per-IP at the global level (300/min) but a tighter
 * dedicated limit applied here so feedback can't be spammed.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmail } from "../services/notifications.js";

const feedbackSchema = z.object({
  isDry: z.boolean(),
  note: z.string().max(200).optional(),
});

const feedbackRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `feedback:${req.ip}`,
    },
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const scheduleResponseSchema = z.object({
  date: z.string().regex(ISO_DATE).optional(),
  note: z.string().max(500).optional(),
  decline: z.boolean().optional(),
});

const scheduleRateLimit = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `ppmsched:${req.ip}`,
    },
  },
};

const checkpointScanRateLimit = {
  config: {
    rateLimit: {
      max: 40,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `cpscan:${req.ip}`,
    },
  },
};

const checkpointScanBody = z.object({
  guardName: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
  flagged: z.boolean().optional(),
});

const reportRateLimit = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => `report:${req.ip}`,
    },
  },
};

const faultReportBody = z.object({
  description: z.string().min(1).max(2000),
  reporterName: z.string().max(120).optional(),
  urgency: z.enum(["routine", "urgent", "emergency"]).optional(),
});

export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  // ─── Get hanger status (page load) ──────────────────────────────────
  // Returns a minimal public-safe view of the hanger: zone name, current
  // alert state ("Spill reported 15 minutes ago"). No org details, no
  // user details, no map. Just enough for the public to see what's going on.
  app.get("/public/feedback/:hangerId", async (req, reply) => {
    const { hangerId } = req.params as { hangerId: string };

    const [hanger] = await db
      .select({
        zoneName: schema.zones.name,
        floorName: schema.floors.name,
      })
      .from(schema.hangers)
      .leftJoin(schema.zones, eq(schema.zones.id, schema.hangers.zoneId))
      .leftJoin(schema.floors, eq(schema.floors.id, schema.zones.floorId))
      .where(eq(schema.hangers.id, hangerId))
      .limit(1);
    if (!hanger) return reply.code(404).send({ error: "unknown_hanger" });

    const [openAlert] = await db
      .select({
        id: schema.alerts.id,
        openedAt: schema.alerts.openedAt,
        acknowledgedAt: schema.alerts.acknowledgedAt,
      })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.hangerId, hangerId),
        isNull(schema.alerts.closedAt),
      ))
      .orderBy(desc(schema.alerts.openedAt))
      .limit(1);

    return {
      zoneName: hanger.zoneName,
      floorName: hanger.floorName,
      hasOpenAlert: !!openAlert,
      openedAt: openAlert?.openedAt?.toISOString() ?? null,
      acknowledgedAt: openAlert?.acknowledgedAt?.toISOString() ?? null,
    };
  });

  // ─── Submit feedback ────────────────────────────────────────────────
  // Attaches feedback to the most recent (open or recently closed) alert.
  // Stored as a closure note + audit-log entry for the admin's visibility.
  app.post(
    "/public/feedback/:hangerId",
    feedbackRateLimit,
    async (req, reply) => {
      const { hangerId } = req.params as { hangerId: string };
      const parsed = feedbackSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

      const [hanger] = await db
        .select({ orgId: schema.hangers.organisationId })
        .from(schema.hangers)
        .where(eq(schema.hangers.id, hangerId))
        .limit(1);
      if (!hanger) return reply.code(404).send({ error: "unknown_hanger" });

      const [recentAlert] = await db
        .select({ id: schema.alerts.id })
        .from(schema.alerts)
        .where(eq(schema.alerts.hangerId, hangerId))
        .orderBy(desc(schema.alerts.openedAt))
        .limit(1);

      // Audit log of the feedback so admins can see public engagement,
      // even when there's no live alert to attach it to.
      const tag = parsed.data.isDry ? "tenant_confirmed_dry" : "tenant_reports_wet";
      const detail = parsed.data.note ?? "";
      await db.insert(schema.auditLog).values({
        organisationId: hanger.orgId,
        actorUserId: null,
        action: tag,
        targetType: "hanger",
        targetId: hangerId,
        metadata: { detail },
      });

      // If there's an active alert and the tenant says "still wet", flag
      // the alert as escalated so it bubbles up in the admin dashboard.
      if (recentAlert && !parsed.data.isDry) {
        await db
          .update(schema.alerts)
          .set({ escalatedAt: new Date() })
          .where(eq(schema.alerts.id, recentAlert.id));
      }

      return { ok: true };
    },
  );

  // ─── PPM contractor scheduling (magic link) ─────────────────────────────
  // A contractor opens app.hazardlink.ie/schedule/<token>, which loads this.
  // Public-safe view: who's asking, what the job is, current state. No org
  // internals, no other tasks.
  app.get("/public/ppm-schedule/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [r] = await db
      .select()
      .from(schema.ppmScheduleRequests)
      .where(eq(schema.ppmScheduleRequests.token, token))
      .limit(1);
    if (!r) return reply.code(404).send({ error: "not_found" });

    const [ppm] = await db
      .select({
        title: schema.ppms.title,
        notes: schema.ppms.notes,
        frequencyPerYear: schema.ppms.frequencyPerYear,
        contractorName: schema.ppms.contractorName,
        buildingId: schema.ppms.buildingId,
      })
      .from(schema.ppms)
      .where(eq(schema.ppms.id, r.ppmId))
      .limit(1);
    const [org] = await db
      .select({ name: schema.organisations.name })
      .from(schema.organisations)
      .where(eq(schema.organisations.id, r.organisationId))
      .limit(1);

    // Site location + on-site contact (from the building) so the contractor
    // sees where to go and who to meet on the page, not just in the email.
    let building: typeof schema.buildings.$inferSelect | null = null;
    if (ppm?.buildingId) {
      const [bld] = await db.select().from(schema.buildings).where(eq(schema.buildings.id, ppm.buildingId)).limit(1);
      building = bld ?? null;
    }

    const expired = r.expiresAt.getTime() < Date.now();
    return {
      orgName: org?.name ?? "Maintenance",
      title: ppm?.title ?? "Planned maintenance visit",
      notes: ppm?.notes ?? null,
      frequencyPerYear: ppm?.frequencyPerYear ?? 1,
      contractorName: ppm?.contractorName ?? null,
      siteName: building?.name ?? null,
      siteAddress: building?.address ?? null,
      siteContactName: building?.siteContactName ?? null,
      siteContactPhone: building?.siteContactPhone ?? null,
      siteContactEmail: building?.siteContactEmail ?? null,
      status: r.status,
      proposedDate: r.proposedDate,
      confirmedDate: r.confirmedDate,
      contractorNote: r.contractorNote,
      expired,
    };
  });

  // Contractor submits a date (or declines). Idempotent until staff confirm.
  app.post("/public/ppm-schedule/:token", scheduleRateLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const parsed = scheduleResponseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });

    const [r] = await db
      .select()
      .from(schema.ppmScheduleRequests)
      .where(eq(schema.ppmScheduleRequests.token, token))
      .limit(1);
    if (!r) return reply.code(404).send({ error: "not_found" });
    if (r.status === "cancelled") return reply.code(409).send({ error: "cancelled" });
    if (r.status === "confirmed") return reply.code(409).send({ error: "already_confirmed" });
    if (r.expiresAt.getTime() < Date.now()) return reply.code(409).send({ error: "expired" });

    const note = parsed.data.note?.trim() || null;

    if (parsed.data.decline) {
      await db
        .update(schema.ppmScheduleRequests)
        .set({ status: "declined", contractorNote: note, respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.ppmScheduleRequests.id, r.id));
      await notifyStaffOfResponse(r.organisationId, r.ppmId, "declined", null, note);
      return { ok: true, status: "declined" };
    }

    const date = parsed.data.date;
    if (!date) return reply.code(400).send({ error: "date_required" });
    const todayISO = new Date().toISOString().slice(0, 10);
    if (date < todayISO) return reply.code(400).send({ error: "date_in_past" });

    await db
      .update(schema.ppmScheduleRequests)
      .set({
        status: "proposed",
        proposedDate: date,
        contractorNote: note ?? r.contractorNote,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.ppmScheduleRequests.id, r.id));
    await notifyStaffOfResponse(r.organisationId, r.ppmId, "proposed", date, note);
    return { ok: true, status: "proposed", proposedDate: date };
  });

  // ─── Guard checkpoint scan (magic link) ─────────────────────────────────
  // A guard scans a checkpoint's QR → opens this → confirms → scan is logged.
  app.get("/public/checkpoint/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [cp] = await db
      .select()
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.token, token))
      .limit(1);
    if (!cp || !cp.active) return reply.code(404).send({ error: "not_found" });
    const [org] = await db
      .select({ name: schema.organisations.name })
      .from(schema.organisations)
      .where(eq(schema.organisations.id, cp.organisationId))
      .limit(1);
    let buildingName: string | null = null;
    if (cp.buildingId) {
      const [b] = await db.select({ name: schema.buildings.name }).from(schema.buildings).where(eq(schema.buildings.id, cp.buildingId)).limit(1);
      buildingName = b?.name ?? null;
    }
    return {
      orgName: org?.name ?? "Security",
      name: cp.name,
      locationNote: cp.locationNote,
      instructions: cp.instructions,
      buildingName,
    };
  });

  app.post("/public/checkpoint/:token", checkpointScanRateLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const parsed = checkpointScanBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const [cp] = await db
      .select()
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.token, token))
      .limit(1);
    if (!cp || !cp.active) return reply.code(404).send({ error: "not_found" });
    await db.insert(schema.checkpointScans).values({
      organisationId: cp.organisationId,
      checkpointId: cp.id,
      guardName: parsed.data.guardName?.trim() || null,
      note: parsed.data.note?.trim() || null,
      flagged: parsed.data.flagged ?? false,
    });
    return { ok: true };
  });

  // ─── Report a fault on an asset (magic link, cross-discipline) ───────────
  // Any worker scans an asset's QR → opens this → describes the fault → it
  // lands as a maintenance job against that asset + its building. No login.
  app.get("/public/report/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const [a] = await db
      .select({ id: schema.assets.id, organisationId: schema.assets.organisationId, name: schema.assets.name, buildingId: schema.assets.buildingId })
      .from(schema.assets)
      .where(eq(schema.assets.reportToken, token))
      .limit(1);
    if (!a) return reply.code(404).send({ error: "not_found" });
    const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, a.organisationId)).limit(1);
    let buildingName: string | null = null;
    if (a.buildingId) {
      const [b] = await db.select({ name: schema.buildings.name }).from(schema.buildings).where(eq(schema.buildings.id, a.buildingId)).limit(1);
      buildingName = b?.name ?? null;
    }
    return { orgName: org?.name ?? "Maintenance", assetName: a.name, buildingName };
  });

  app.post("/public/report/:token", reportRateLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const parsed = faultReportBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const [a] = await db.select().from(schema.assets).where(eq(schema.assets.reportToken, token)).limit(1);
    if (!a) return reply.code(404).send({ error: "not_found" });
    const b = parsed.data;
    const who = b.reporterName?.trim();
    const description = `${b.description.trim()}\n\n— Reported via QR${who ? ` by ${who}` : ""}`;
    const [job] = await db
      .insert(schema.maintenanceJobs)
      .values({
        organisationId: a.organisationId,
        source: "manual",
        assetId: a.id,
        buildingId: a.buildingId,
        title: `Fault reported: ${a.name}`,
        description,
        priority: b.urgency ?? "routine",
        status: "logged",
      })
      .returning();
    if (job) {
      await db.insert(schema.jobEvents).values({
        organisationId: a.organisationId,
        jobId: job.id,
        type: "logged",
        actorUserId: null,
        detail: `Fault reported via QR${who ? ` by ${who}` : ""}`,
      });
    }
    return { ok: true };
  });

  // Best-effort: email the org's admins + supervisors that a contractor replied,
  // so they can confirm in the dashboard. Never throws.
  async function notifyStaffOfResponse(
    orgId: string,
    ppmId: string,
    kind: "proposed" | "declined",
    date: string | null,
    note: string | null,
  ): Promise<void> {
    try {
      const [ppm] = await db
        .select({ title: schema.ppms.title, contractorName: schema.ppms.contractorName })
        .from(schema.ppms)
        .where(eq(schema.ppms.id, ppmId))
        .limit(1);
      const recipients = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(and(
          eq(schema.users.organisationId, orgId),
          inArray(schema.users.role, ["admin", "supervisor"]),
          isNull(schema.users.deactivatedAt),
        ));
      const who = ppm?.contractorName ?? "The contractor";
      const subject = kind === "proposed"
        ? `Contractor proposed a date: ${ppm?.title ?? "PPM"}`
        : `Contractor declined: ${ppm?.title ?? "PPM"}`;
      const body = [
        kind === "proposed"
          ? `${who} proposed ${date} for "${ppm?.title ?? "the planned task"}".`
          : `${who} can't carry out "${ppm?.title ?? "the planned task"}" right now.`,
        ...(note ? [``, `They added: "${note}"`] : []),
        ``,
        kind === "proposed"
          ? `Approve the date in the dashboard: https://app.hazardlink.ie/ppms`
          : `Open the dashboard to arrange another contractor: https://app.hazardlink.ie/ppms`,
      ].join("\n");
      for (const rec of recipients) {
        if (rec.email) await sendEmail({ to: rec.email, subject, text: body });
      }
    } catch (err) {
      console.error("notifyStaffOfResponse failed:", err);
    }
  }
}
