import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { sendEmail } from "./notifications.js";

/**
 * PPM contractor scheduling.
 *
 * When a planned task comes due we email its contractor a magic link — a public
 * page (no login) where they pick a date they can carry the work out. Staff then
 * confirm that date, which stamps ppms.scheduled_date. This module owns creating
 * the outreach row + sending the invite; it's called both by the manual
 * "Request a date" button (routes/ppms.ts) and automatically by the reminder
 * job (services/ppm-reminder.ts).
 */

// Public app base — the contractor opens <base>/schedule/<token>. Same origin
// the PPM reminder already links staff to.
const PUBLIC_BASE = "https://app.hazardlink.ie";
const EXPIRY_DAYS = 30;

export function scheduleUrl(token: string): string {
  return `${PUBLIC_BASE}/schedule/${token}`;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function frequencyLabel(n: number): string {
  switch (n) {
    case 1: return "once a year";
    case 2: return "twice a year";
    case 3: return "3× a year";
    case 4: return "quarterly";
    case 6: return "every 2 months";
    case 12: return "monthly";
    default: return `${n}× a year`;
  }
}

/**
 * Is there already a live outreach for this PPM, so we shouldn't email the
 * contractor again? "Live" = awaiting their reply (sent), awaiting staff
 * confirmation (proposed), or a confirmed visit still in the future. A confirmed
 * visit in the past doesn't block the next cycle.
 */
export async function hasOpenScheduleRequest(ppmId: string, todayISO: string): Promise<boolean> {
  const rows = await db
    .select({
      status: schema.ppmScheduleRequests.status,
      confirmedDate: schema.ppmScheduleRequests.confirmedDate,
    })
    .from(schema.ppmScheduleRequests)
    .where(and(
      eq(schema.ppmScheduleRequests.ppmId, ppmId),
      inArray(schema.ppmScheduleRequests.status, ["sent", "proposed", "confirmed"]),
    ));
  return rows.some((r) =>
    r.status === "sent" ||
    r.status === "proposed" ||
    (r.status === "confirmed" && !!r.confirmedDate && r.confirmedDate >= todayISO),
  );
}

type ScheduleRequest = typeof schema.ppmScheduleRequests.$inferSelect;

/**
 * Create a scheduling request for a PPM and email the contractor a magic link.
 *
 * Returns ok:false only when the PPM can't be reached (missing / no contact
 * email). When SMTP isn't configured the request is still created (so staff can
 * copy the link and send it themselves) and `emailError` is set — callers treat
 * that as a soft warning, not a failure.
 */
export async function requestPpmSchedule(
  ppmId: string,
  opts: { createdByUserId: string | null },
): Promise<{ ok: boolean; error?: string; request?: ScheduleRequest; emailError?: string }> {
  const [ppm] = await db.select().from(schema.ppms).where(eq(schema.ppms.id, ppmId)).limit(1);
  if (!ppm) return { ok: false, error: "ppm_not_found" };

  const email = ppm.contactEmail?.trim();
  if (!email) return { ok: false, error: "no_contact_email" };

  const [org] = await db
    .select({ name: schema.organisations.name })
    .from(schema.organisations)
    .where(eq(schema.organisations.id, ppm.organisationId))
    .limit(1);
  const orgName = org?.name ?? "Your client";

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000);
  const [request] = await db
    .insert(schema.ppmScheduleRequests)
    .values({
      organisationId: ppm.organisationId,
      ppmId: ppm.id,
      token: newToken(),
      status: "sent",
      sentToEmail: email,
      emailDelivered: false,
      createdByUserId: opts.createdByUserId,
      expiresAt,
    })
    .returning();
  if (!request) return { ok: false, error: "insert_failed" };

  const url = scheduleUrl(request.token);
  const subject = `Please book in: ${ppm.title}`;
  const body = [
    `Hello${ppm.contractorName ? " " + ppm.contractorName : ""},`,
    ``,
    `${orgName} manages planned maintenance through HazardLink, and "${ppm.title}" is now due.`,
    `Please pick a date you can carry it out — it takes a few seconds and there's no login:`,
    ``,
    url,
    ``,
    `Job: ${ppm.title}`,
    `How often: ${frequencyLabel(ppm.frequencyPerYear)}`,
    ...(ppm.notes ? [`Notes: ${ppm.notes}`] : []),
    ``,
    `Once you choose a date, ${orgName} confirms it and you're booked in.`,
    ``,
    `Thanks,`,
    orgName,
  ].join("\n");

  const send = await sendEmail({ to: email, subject, text: body, fromName: orgName });
  if (send.ok) {
    await db
      .update(schema.ppmScheduleRequests)
      .set({ emailDelivered: true, updatedAt: new Date() })
      .where(eq(schema.ppmScheduleRequests.id, request.id));
    return { ok: true, request: { ...request, emailDelivered: true } };
  }
  return { ok: true, request, emailError: send.error };
}
