/**
 * Completion dockets — the contractor's no-login proof-of-work record.
 *
 * Staff:
 *   POST /jobs/:id/docket       mint + email a docket link for the job's
 *                               awarded contractor (or resend)
 *   GET  /jobs/:id/dockets      list this job's dockets + status
 *
 * Public (token, rate-limited):
 *   GET  /public/docket/:token        job context (title, site, asset pin,
 *                                     permit ref) + submitted state
 *   POST /public/docket/:token/media  upload a photo or short video; appends
 *                                     to the docket's evidence server-side
 *   POST /public/docket/:token        submit the docket
 *
 * Submitting: logs a job event; auto-completes the job when the outcome is
 * 'fixed' with photo evidence; and when the contractor flags further repairs
 * and offers to quote, spawns a follow-up job with a quote invitation emailed
 * straight back to them — the "additional repairs never die on paper" loop.
 * A docket is also auto-sent when a job is awarded (hook in maintenance.ts).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ctx } from "../services/auth-context.js";
import { sendEmail } from "../services/notifications.js";
import { notifyOrgRole } from "../services/notification-centre.js";
import { uploadDocketMedia } from "../services/storage.js";

const DOCKET_BASE = "https://app.hazardlink.ie";
const publicWriteLimit = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
const publicReadLimit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

const OK_PHOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const OK_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];

/** Mint a docket for a job's contractor and email the link. Never throws —
 *  used fire-and-forget from the award flow. Returns the docket row or null. */
export async function createAndSendDocket(orgId: string, jobId: string, contractorId: string | null): Promise<{ token: string } | null> {
  try {
    const [job] = await db.select().from(schema.maintenanceJobs)
      .where(and(eq(schema.maintenanceJobs.id, jobId), eq(schema.maintenanceJobs.organisationId, orgId))).limit(1);
    if (!job) return null;
    const token = randomBytes(24).toString("base64url");
    const [row] = await db.insert(schema.jobDockets).values({
      organisationId: orgId,
      jobId,
      contractorId,
      token,
    }).returning();

    if (contractorId) {
      const [con] = await db.select({ name: schema.contractors.name, email: schema.contractors.email })
        .from(schema.contractors).where(eq(schema.contractors.id, contractorId)).limit(1);
      const [org] = await db.select({ name: schema.organisations.name })
        .from(schema.organisations).where(eq(schema.organisations.id, orgId)).limit(1);
      if (con?.email) {
        const url = `${DOCKET_BASE}/docket/${token}`;
        await sendEmail({
          to: con.email,
          subject: `Completion docket — ${job.title}`,
          fromName: org?.name || "HazardLink",
          text:
`Hello${con.name ? " " + con.name : ""},

When the work on "${job.title}" is done, please fill in the completion docket:

${url}

It takes about two minutes on your phone: what was done, parts used, a couple of photos, and your signature. If you find anything else that needs attention you can flag it there and offer to quote for it.

Thanks,
${org?.name || "HazardLink"}`,
        });
      }
    }
    return row ? { token: row.token } : null;
  } catch {
    return null;
  }
}

async function docketByToken(token: string) {
  if (!token || token.length < 20) return null;
  const [d] = await db.select().from(schema.jobDockets).where(eq(schema.jobDockets.token, token)).limit(1);
  return d ?? null;
}

export default async function docketRoutes(app: FastifyInstance): Promise<void> {
  const requireStaff = async (req: any, reply: any) => {
    const role = req.user?.role;
    if (role !== "admin" && role !== "supervisor") return reply.code(403).send({ error: "forbidden" });
  };

  app.post("/jobs/:id/docket", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const [job] = await db.select().from(schema.maintenanceJobs)
      .where(and(eq(schema.maintenanceJobs.id, id), eq(schema.maintenanceJobs.organisationId, c.orgId))).limit(1);
    if (!job) return reply.code(404).send({ error: "not_found" });
    // The awarded quote tells us who's on site.
    let contractorId: string | null = null;
    if (job.awardedQuoteId) {
      const [q] = await db.select({ contractorId: schema.jobQuotes.contractorId })
        .from(schema.jobQuotes).where(eq(schema.jobQuotes.id, job.awardedQuoteId)).limit(1);
      contractorId = q?.contractorId ?? null;
    }
    const made = await createAndSendDocket(c.orgId, id, contractorId);
    if (!made) return reply.code(500).send({ error: "could_not_create" });
    return { ok: true, url: `${DOCKET_BASE}/docket/${made.token}`, emailed: !!contractorId };
  });

  app.get("/jobs/:id/dockets", { preHandler: [app.authenticate, requireStaff] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = ctx(req);
    const rows = await db.select().from(schema.jobDockets)
      .where(and(eq(schema.jobDockets.jobId, id), eq(schema.jobDockets.organisationId, c.orgId)))
      .orderBy(desc(schema.jobDockets.sentAt))
      .limit(20);
    return { dockets: rows.map((d) => ({ ...d, url: `${DOCKET_BASE}/docket/${d.token}` })) };
  });

  /* ── Public, token-gated ─────────────────────────────────────────── */

  app.get("/public/docket/:token", publicReadLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const d = await docketByToken(token);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const [job] = await db.select().from(schema.maintenanceJobs).where(eq(schema.maintenanceJobs.id, d.jobId)).limit(1);
    const [org] = await db.select({ name: schema.organisations.name })
      .from(schema.organisations).where(eq(schema.organisations.id, d.organisationId)).limit(1);
    let contractorName: string | null = null;
    if (d.contractorId) {
      const [con] = await db.select({ name: schema.contractors.name })
        .from(schema.contractors).where(eq(schema.contractors.id, d.contractorId)).limit(1);
      contractorName = con?.name ?? null;
    }
    let buildingName: string | null = null;
    if (job?.buildingId) {
      const [b] = await db.select({ name: schema.buildings.name })
        .from(schema.buildings).where(eq(schema.buildings.id, job.buildingId)).limit(1);
      buildingName = b?.name ?? null;
    }
    // Asset + floor-plan pin, same as the quote page.
    let location: Record<string, unknown> | null = null;
    if (job?.assetId) {
      const [a] = await db.select().from(schema.assets).where(eq(schema.assets.id, job.assetId)).limit(1);
      if (a) {
        let floorName: string | null = null;
        let floorPlanUrl: string | null = null;
        if (a.floorId) {
          const [f] = await db.select({ name: schema.floors.name, floorPlanUrl: schema.floors.floorPlanUrl })
            .from(schema.floors).where(eq(schema.floors.id, a.floorId)).limit(1);
          floorName = f?.name ?? null;
          floorPlanUrl = f?.floorPlanUrl ?? null;
        }
        location = {
          assetName: a.name, assetSerial: a.serial, assetMake: a.make, assetModel: a.model,
          floorName, floorPlanUrl,
          pin: a.posX != null && a.posY != null ? { x: a.posX, y: a.posY } : null,
        };
      }
    }
    // An active/approved permit on this job is referenced in the declaration.
    let permitRef: string | null = null;
    const permits = await db.select({ id: schema.permits.id, status: schema.permits.status })
      .from(schema.permits).where(eq(schema.permits.jobId, d.jobId)).limit(5);
    const livePermit = permits.find((p) => p.status === "active" || p.status === "approved");
    if (livePermit) permitRef = "PTW-" + livePermit.id.slice(0, 6).toUpperCase();

    return {
      orgName: org?.name ?? "HazardLink",
      contractorName,
      jobTitle: job?.title ?? "Maintenance work",
      jobDescription: job?.description ?? null,
      buildingName,
      location,
      permitRef,
      submitted: d.status === "submitted",
      docket: d.status === "submitted" ? {
        outcome: d.outcome, backInService: d.backInService, workDone: d.workDone,
        parts: d.parts, arrivedTime: d.arrivedTime, leftTime: d.leftTime,
        furtherRepairs: d.furtherRepairs, furtherDetails: d.furtherDetails,
        furtherUrgency: d.furtherUrgency, wantsQuote: d.wantsQuote,
        safetyConcerns: d.safetyConcerns, methodConfirmed: d.methodConfirmed,
        signedName: d.signedName, media: d.media, submittedAt: d.submittedAt,
      } : { media: d.media },
    };
  });

  app.post("/public/docket/:token/media", publicWriteLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const d = await docketByToken(token);
    if (!d) return reply.code(404).send({ error: "not_found" });
    if (d.status === "submitted") return reply.code(409).send({ error: "already_submitted" });
    const file = await (req as any).file({ limits: { fileSize: 60 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: "no_file" });
    const isPhoto = OK_PHOTO.includes(file.mimetype);
    const isVideo = OK_VIDEO.includes(file.mimetype);
    if (!isPhoto && !isVideo) return reply.code(400).send({ error: "unsupported_type" });
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(400).send({ error: "file_too_large" });
    }
    const label = String((file.fields?.label as any)?.value || (isVideo ? "video" : "photo")).slice(0, 20);
    const { url } = await uploadDocketMedia({
      filename: file.filename || (isVideo ? "video.mp4" : "photo.jpg"),
      mimetype: file.mimetype,
      body: buf,
    });
    const media = [...((d.media as any[]) || []), {
      url, kind: isVideo ? "video" : "photo", label, uploadedAt: new Date().toISOString(),
    }];
    await db.update(schema.jobDockets).set({ media }).where(eq(schema.jobDockets.id, d.id));
    return { ok: true, media };
  });

  const submitBody = z.object({
    outcome: z.enum(["fixed", "temporary_fix", "not_completed"]),
    backInService: z.boolean(),
    workDone: z.string().min(5).max(4000),
    parts: z.array(z.object({ name: z.string().min(1).max(200), qty: z.number().int().min(1).max(999) })).max(50).default([]),
    arrivedTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    leftTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
    furtherRepairs: z.boolean(),
    furtherDetails: z.string().max(2000).nullish(),
    furtherUrgency: z.enum(["routine", "urgent", "emergency"]).nullish(),
    wantsQuote: z.boolean().default(false),
    safetyConcerns: z.string().max(2000).nullish(),
    methodConfirmed: z.boolean(),
    signedName: z.string().min(2).max(120),
    signatureDataUrl: z.string().startsWith("data:image/").max(200_000),
  });
  app.post("/public/docket/:token", publicWriteLimit, async (req, reply) => {
    const { token } = req.params as { token: string };
    const d = await docketByToken(token);
    if (!d) return reply.code(404).send({ error: "not_found" });
    if (d.status === "submitted") return reply.code(409).send({ error: "already_submitted" });
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    const b = parsed.data;
    if (b.furtherRepairs && !String(b.furtherDetails || "").trim()) {
      return reply.code(400).send({ error: "further_details_required" });
    }

    const [job] = await db.select().from(schema.maintenanceJobs).where(eq(schema.maintenanceJobs.id, d.jobId)).limit(1);
    if (!job) return reply.code(404).send({ error: "not_found" });

    await db.update(schema.jobDockets).set({
      status: "submitted",
      submittedAt: new Date(),
      outcome: b.outcome,
      backInService: b.backInService,
      workDone: b.workDone,
      parts: b.parts,
      arrivedTime: b.arrivedTime ?? null,
      leftTime: b.leftTime ?? null,
      furtherRepairs: b.furtherRepairs,
      furtherDetails: b.furtherDetails ?? null,
      furtherUrgency: b.furtherUrgency ?? null,
      wantsQuote: b.wantsQuote,
      safetyConcerns: b.safetyConcerns ?? null,
      methodConfirmed: b.methodConfirmed,
      signedName: b.signedName,
      signatureDataUrl: b.signatureDataUrl,
    }).where(eq(schema.jobDockets.id, d.id));

    await db.insert(schema.jobEvents).values({
      organisationId: d.organisationId,
      jobId: d.jobId,
      type: "note",
      detail: `Completion docket submitted by ${b.signedName} — ${
        b.outcome === "fixed" ? "fixed" : b.outcome === "temporary_fix" ? "temporary fix, return needed" : "could not complete"
      }${b.furtherRepairs ? "; further repairs flagged" : ""}`,
    });

    // Auto-complete: fixed + photo evidence + job still open. The docket IS
    // the proof of completion, so the loop closes itself.
    const photos = ((d.media as any[]) || []).filter((m) => m.kind === "photo");
    const jobOpen = job.status !== "completed" && job.status !== "cancelled";
    let autoCompleted = false;
    if (b.outcome === "fixed" && photos.length > 0 && jobOpen) {
      await db.update(schema.maintenanceJobs).set({
        status: "completed",
        completedAt: new Date(),
        completionNote: `Contractor docket: ${b.workDone.slice(0, 500)}`,
        completionPhotoUrl: photos[photos.length - 1].url,
        updatedAt: new Date(),
      }).where(eq(schema.maintenanceJobs.id, d.jobId));
      await db.insert(schema.jobEvents).values({
        organisationId: d.organisationId,
        jobId: d.jobId,
        type: "completed",
        detail: "Auto-completed from the contractor's docket (fixed, with photo evidence)",
      });
      autoCompleted = true;
    }

    // Further repairs → a real follow-up job; and when the contractor offered
    // to quote, invite them immediately so the work never dies on the docket.
    let followupJobId: string | null = null;
    if (b.furtherRepairs && String(b.furtherDetails || "").trim()) {
      const detail = String(b.furtherDetails).trim();
      const [fu] = await db.insert(schema.maintenanceJobs).values({
        organisationId: d.organisationId,
        source: "manual",
        buildingId: job.buildingId,
        floorId: job.floorId,
        zoneId: job.zoneId,
        assetId: job.assetId,
        title: `Further works: ${detail.slice(0, 120)}`,
        description: `${detail}\n\nFlagged on the completion docket for "${job.title}" by ${b.signedName}.`,
        priority: b.furtherUrgency === "emergency" ? "emergency" : b.furtherUrgency === "urgent" ? "urgent" : "routine",
        status: "logged",
      }).returning();
      if (fu) {
        followupJobId = fu.id;
        await db.update(schema.jobDockets).set({ followupJobId: fu.id }).where(eq(schema.jobDockets.id, d.id));
        await db.insert(schema.jobEvents).values({
          organisationId: d.organisationId,
          jobId: fu.id,
          type: "logged",
          detail: `Raised from the completion docket for "${job.title}"`,
        });
        if (b.wantsQuote && d.contractorId) {
          const qToken = randomBytes(24).toString("base64url");
          await db.insert(schema.jobQuotes).values({
            jobId: fu.id,
            organisationId: d.organisationId,
            contractorId: d.contractorId,
            status: "pending",
            token: qToken,
          });
          const [con] = await db.select({ name: schema.contractors.name, email: schema.contractors.email })
            .from(schema.contractors).where(eq(schema.contractors.id, d.contractorId)).limit(1);
          const [org] = await db.select({ name: schema.organisations.name })
            .from(schema.organisations).where(eq(schema.organisations.id, d.organisationId)).limit(1);
          if (con?.email) {
            await sendEmail({
              to: con.email,
              subject: `Quote request — ${fu.title}`,
              fromName: org?.name || "HazardLink",
              text:
`Hello${con.name ? " " + con.name : ""},

Thanks for flagging this on your docket. Please price the follow-up work here:

${DOCKET_BASE}/quote/${qToken}

${detail}

Thanks,
${org?.name || "HazardLink"}`,
            });
          }
        }
      }
    }

    try {
      await notifyOrgRole(d.organisationId, ["admin", "supervisor"], {
        type: "docket.submitted",
        title: `Docket in: ${job.title}`,
        body: `${b.signedName} — ${b.outcome === "fixed" ? "fixed" : b.outcome === "temporary_fix" ? "temporary fix" : "not completed"}` +
          (autoCompleted ? "; job auto-completed" : "") +
          (followupJobId ? "; further repairs logged as a new job" : "") +
          (String(b.safetyConcerns || "").trim() ? "; safety concern reported" : ""),
        entityType: "job",
        entityId: d.jobId,
      });
    } catch { /* non-blocking */ }

    return { ok: true, autoCompleted, followupJobId };
  });
}
