/**
 * Audit pack — a one-click, self-contained, PRINTABLE evidence document for a
 * site (or the whole org) over a date range. Assembles what an HSA inspector,
 * insurer or client auditor actually asks for:
 *
 *   • spill alerts with detection → acknowledged → resolved timings + proof photo flags
 *   • security incidents (severity, status, resolution)
 *   • cleaning/mobile inspections with scores
 *   • the SDS chemical register (verification state)
 *   • staff certifications with expiry status
 *   • contractor vault documents (insurance, SafePass, RAMS…) with expiry status
 *   • the audit-log tail for the period
 *
 * Everything is read from the org's real records — nothing is synthesised. If a
 * section has no rows it says "No records in this period", it never pads.
 * Output is a single HTML document with inline styles: open → Cmd/Ctrl-P → PDF.
 */
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export interface AuditPackOptions {
  orgId: string;
  buildingId?: string | null;
  from: Date;
  to: Date;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().replace("T", " ").slice(0, 16);
}

function mins(a: Date | null, b: Date | null): string {
  if (!a || !b) return "—";
  const m = Math.round((b.getTime() - a.getTime()) / 60000);
  return m >= 0 ? `${m} min` : "—";
}

function expiryStatus(expires: string | null): { label: string; tone: string } {
  if (!expires) return { label: "no expiry set", tone: "muted" };
  const d = new Date(expires + "T00:00:00Z");
  const days = Math.floor((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "EXPIRED", tone: "bad" };
  if (days <= 60) return { label: `expires in ${days}d`, tone: "warn" };
  return { label: "valid", tone: "ok" };
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p class="empty">No records in this period.</p>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export async function buildAuditPack(opts: AuditPackOptions): Promise<string> {
  const { orgId, buildingId, from, to } = opts;

  const [org] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, orgId)).limit(1);
  const building = buildingId
    ? (await db.select().from(schema.buildings).where(and(eq(schema.buildings.id, buildingId), eq(schema.buildings.organisationId, orgId))).limit(1))[0] ?? null
    : null;

  // ── Spill alerts (hanger → zone → floor for the building filter) ──────────
  const alertConds: SQL[] = [
    eq(schema.alerts.organisationId, orgId),
    gte(schema.alerts.openedAt, from),
    lte(schema.alerts.openedAt, to),
  ];
  let alertRows;
  if (building) {
    alertRows = await db
      .select({ a: schema.alerts, hangerName: schema.hangers.name })
      .from(schema.alerts)
      .innerJoin(schema.hangers, eq(schema.alerts.hangerId, schema.hangers.id))
      .innerJoin(schema.zones, eq(schema.hangers.zoneId, schema.zones.id))
      .innerJoin(schema.floors, eq(schema.zones.floorId, schema.floors.id))
      .where(and(...alertConds, eq(schema.floors.buildingId, building.id)))
      .orderBy(desc(schema.alerts.openedAt))
      .limit(500);
  } else {
    alertRows = await db
      .select({ a: schema.alerts, hangerName: schema.hangers.name })
      .from(schema.alerts)
      .innerJoin(schema.hangers, eq(schema.alerts.hangerId, schema.hangers.id))
      .where(and(...alertConds))
      .orderBy(desc(schema.alerts.openedAt))
      .limit(500);
  }

  // ── Security incidents ────────────────────────────────────────────────────
  const incidentConds: SQL[] = [
    eq(schema.securityIncidents.organisationId, orgId),
    gte(schema.securityIncidents.createdAt, from),
    lte(schema.securityIncidents.createdAt, to),
  ];
  if (building) incidentConds.push(eq(schema.securityIncidents.buildingId, building.id));
  const incidents = await db
    .select()
    .from(schema.securityIncidents)
    .where(and(...incidentConds))
    .orderBy(desc(schema.securityIncidents.createdAt))
    .limit(500);

  // ── Inspections ───────────────────────────────────────────────────────────
  const inspConds: SQL[] = [
    eq(schema.inspections.organisationId, orgId),
    gte(schema.inspections.createdAt, from),
    lte(schema.inspections.createdAt, to),
  ];
  if (building) inspConds.push(eq(schema.inspections.buildingId, building.id));
  const insp = await db
    .select()
    .from(schema.inspections)
    .where(and(...inspConds))
    .orderBy(desc(schema.inspections.createdAt))
    .limit(500);

  // ── SDS register (point-in-time register, not range-filtered) ─────────────
  const sds = await db
    .select()
    .from(schema.sdsSheets)
    .where(eq(schema.sdsSheets.organisationId, orgId))
    .orderBy(schema.sdsSheets.productName)
    .limit(500);

  // ── Staff certifications ──────────────────────────────────────────────────
  const certs = await db
    .select({ c: schema.staffCertifications, userName: schema.users.name })
    .from(schema.staffCertifications)
    .innerJoin(schema.users, eq(schema.staffCertifications.userId, schema.users.id))
    .where(eq(schema.staffCertifications.organisationId, orgId))
    .orderBy(schema.users.name)
    .limit(500);

  // ── Contractor vault documents ────────────────────────────────────────────
  const conDocs = await db
    .select({ d: schema.contractorDocuments, contractorName: schema.contractors.name })
    .from(schema.contractorDocuments)
    .innerJoin(schema.contractors, eq(schema.contractorDocuments.contractorId, schema.contractors.id))
    .where(eq(schema.contractorDocuments.organisationId, orgId))
    .orderBy(schema.contractors.name)
    .limit(500);

  // ── Audit log tail ────────────────────────────────────────────────────────
  const logs = await db
    .select()
    .from(schema.auditLog)
    .where(and(
      eq(schema.auditLog.organisationId, orgId),
      gte(schema.auditLog.at, from),
      lte(schema.auditLog.at, to),
    ))
    .orderBy(desc(schema.auditLog.at))
    .limit(200);

  const toneBadge = (t: { label: string; tone: string }) =>
    `<span class="badge badge-${t.tone}">${esc(t.label)}</span>`;

  const scopeLabel = building ? building.name : "All sites";
  const title = `Audit pack — ${org?.name ?? "Organisation"} — ${scopeLabel}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font: 13px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #0d1526; margin: 40px auto; max-width: 900px; padding: 0 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 8px; border-bottom: 2px solid #e2e8f1; padding-bottom: 6px; page-break-after: avoid; }
  .meta { color: #707a92; font-size: 12.5px; margin-bottom: 4px; }
  .brandbar { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 3px solid #2563EB; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-weight: 800; color: #2563EB; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; page-break-inside: auto; }
  th { text-align: left; color: #707a92; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #d3dbe7; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .empty { color: #707a92; font-style: italic; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-ok    { background: #e6f6ee; color: #147a4d; }
  .badge-warn  { background: #fdf1dc; color: #9a6a10; }
  .badge-bad   { background: #fde8e8; color: #b42323; }
  .badge-muted { background: #eef2f7; color: #707a92; }
  .foot { margin-top: 32px; color: #707a92; font-size: 11px; border-top: 1px solid #e2e8f1; padding-top: 10px; }
  @media print { body { margin: 0; } .brandbar { margin-top: 0; } }
</style></head><body>
<div class="brandbar"><div><h1>${esc(title)}</h1>
<div class="meta">Period: ${fmt(from)} to ${fmt(to)} (UTC) · Generated: ${fmt(new Date())}</div></div>
<div class="brand">HazardLink</div></div>

<h2>1. Spill response (IoT wet-floor alerts)</h2>
${table(
    ["Opened", "Location", "Acknowledged", "Time to ack", "Resolved", "Time to resolve", "Status", "Proof photo"],
    alertRows.map((r) => [
      esc(fmt(r.a.openedAt)),
      esc(r.hangerName ?? "—"),
      esc(fmt(r.a.acknowledgedAt)),
      esc(mins(r.a.openedAt, r.a.acknowledgedAt)),
      esc(fmt(r.a.closedAt)),
      esc(mins(r.a.openedAt, r.a.closedAt)),
      esc(r.a.status),
      r.a.closePhotoUrl ? `<span class="badge badge-ok">yes</span>` : `<span class="badge badge-muted">no</span>`,
    ]),
  )}

<h2>2. Security incidents</h2>
${table(
    ["Reported", "Title", "Kind", "Severity", "Status", "Resolved"],
    incidents.map((i) => [
      esc(fmt(i.createdAt)), esc(i.title), esc(i.kind ?? "—"), esc(i.severity), esc(i.status), esc(fmt(i.resolvedAt)),
    ]),
  )}

<h2>3. Inspections</h2>
${table(
    ["Date", "Area", "Inspector", "Score", "Note"],
    insp.map((i) => [
      esc(fmt(i.createdAt)), esc(i.area ?? "—"), esc(i.inspectorName ?? "—"),
      i.score == null ? "—" : `${i.score}%`, esc(i.note ?? ""),
    ]),
  )}

<h2>4. Chemical register (Safety Data Sheets)</h2>
${table(
    ["Product", "Manufacturer", "Signal word", "Verified"],
    sds.map((s) => [
      esc(s.productName), esc(s.manufacturer ?? "—"), esc(s.signalWord ?? "—"),
      s.verified ? `<span class="badge badge-ok">verified</span>` : `<span class="badge badge-warn">awaiting check</span>`,
    ]),
  )}

<h2>5. Staff certifications</h2>
${table(
    ["Staff member", "Certification", "Issuer", "Expires", "Status"],
    certs.map((r) => [
      esc(r.userName), esc(r.c.name), esc(r.c.issuer ?? "—"), esc(r.c.expiresOn ?? "—"),
      toneBadge(expiryStatus(r.c.expiresOn)),
    ]),
  )}

<h2>6. Contractor documents</h2>
${table(
    ["Contractor", "Document", "Type", "Expires", "Status"],
    conDocs.map((r) => [
      esc(r.contractorName), esc(r.d.name), esc(r.d.type), esc(r.d.expiresOn ?? "—"),
      toneBadge(expiryStatus(r.d.expiresOn)),
    ]),
  )}

<h2>7. System audit log (last ${logs.length} entries in period)</h2>
${table(
    ["When", "Action", "Target"],
    logs.map((l) => [
      esc(fmt(l.at)), esc(l.action),
      esc([l.targetType, l.targetId].filter(Boolean).join(" · ") || "—"),
    ]),
  )}

<div class="foot">Produced by HazardLink from the organisation's live records. Sections with no rows had no records in the selected period. hazardlink.ie</div>
</body></html>`;
}
