import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";

/**
 * PPMs — Planned Preventive Maintenance.
 *
 * Recurring maintenance jobs (fire-extinguisher service, PAT testing, HVAC
 * filters…) with the contractor's details, a due date, and a yearly
 * frequency. The backend emails admins + supervisors as each task nears its
 * due date; this page shows due/overdue badges and lets staff add, edit,
 * complete (rolls the due date forward), and delete tasks.
 */

export interface PpmSchedule {
  id: string;
  status: "sent" | "proposed" | "confirmed" | "declined" | "cancelled";
  sentToEmail: string | null;
  emailDelivered: boolean;
  proposedDate: string | null;
  confirmedDate: string | null;
  contractorNote: string | null;
  token: string;
  scheduleUrl: string;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface Ppm {
  id: string;
  title: string;
  notes: string | null;
  contractorName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  frequencyPerYear: number;
  nextDueDate: string; // YYYY-MM-DD
  reminderLeadDays: number;
  lastCompletedAt: string | null;
  lastRemindedOn: string | null;
  scheduledDate: string | null; // agreed contractor visit date, once confirmed
  schedule: PpmSchedule | null;  // latest scheduling outreach for this task
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const FREQ_OPTIONS = [
  { v: 1, l: "Annually (1× a year)" },
  { v: 2, l: "Twice a year (2×)" },
  { v: 3, l: "3× a year" },
  { v: 4, l: "Quarterly (4×)" },
  { v: 6, l: "Every 2 months (6×)" },
  { v: 12, l: "Monthly (12×)" },
];

// ─── Shared status helpers (also used by the dashboard login banner) ────────

export function ppmDaysUntil(p: Ppm): number {
  const due = Date.parse(p.nextDueDate + "T00:00:00");
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((due - todayMid) / 86_400_000);
}

type PpmStatusKey = "overdue" | "due" | "ok" | "paused";

export function ppmStatus(p: Ppm): { key: PpmStatusKey; label: string; days: number } {
  const days = ppmDaysUntil(p);
  if (!p.active) return { key: "paused", label: "Paused", days };
  if (days < 0) return { key: "overdue", label: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, days };
  if (days === 0) return { key: "due", label: "Due today", days };
  if (days <= p.reminderLeadDays) return { key: "due", label: `Due in ${days} day${days === 1 ? "" : "s"}`, days };
  return { key: "ok", label: `Due ${formatDate(p.nextDueDate)}`, days };
}

function frequencyLabel(n: number): string {
  switch (n) {
    case 1: return "Annually";
    case 2: return "Twice a year";
    case 3: return "3× a year";
    case 4: return "Quarterly";
    case 6: return "Every 2 months";
    case 12: return "Monthly";
    default: return `${n}× a year`;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function todayPlusDaysISO(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

// ─── Login banner (rendered on the Dashboard) ───────────────────────────────

export function PpmReminderBanner() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  useTicker(60_000);

  const { data } = useQuery({
    queryKey: ["ppms"],
    queryFn: () => api<{ ppms: Ppm[] }>("/ppms"),
    enabled: isStaff,
    refetchInterval: 60_000,
  });

  if (!isStaff || !data) return null;
  const active = data.ppms.filter((p) => p.active);
  const overdue = active.filter((p) => ppmStatus(p).key === "overdue").length;
  const dueSoon = active.filter((p) => ppmStatus(p).key === "due").length;
  if (overdue === 0 && dueSoon === 0) return null;

  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (dueSoon > 0) parts.push(`${dueSoon} due soon`);

  return (
    <Link
      to="/ppms"
      className={
        "flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-lg border text-sm " +
        (overdue > 0
          ? "bg-red-50 border-red-300 text-red-700"
          : "bg-amber-50 border-amber-300 text-amber-700")
      }
    >
      <span>
        🔧 <span className="font-medium">Maintenance:</span> {parts.join(" · ")} —{" "}
        review planned preventive maintenance.
      </span>
      <span className="shrink-0 text-xs opacity-80">View PPMs →</span>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * Compact list of PPMs that are due soon or overdue — rendered on the Active
 * alerts dashboard so maintenance that needs booking sits beside live spills.
 * Staff-only; renders nothing when there's nothing due.
 */
export function PpmDueList() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  useTicker(60_000);

  const { data } = useQuery({
    queryKey: ["ppms"],
    queryFn: () => api<{ ppms: Ppm[] }>("/ppms"),
    enabled: isStaff,
    refetchInterval: 60_000,
  });
  if (!isStaff || !data) return null;

  const due = data.ppms
    .filter((p) => p.active)
    .map((p) => ({ p, s: ppmStatus(p) }))
    .filter((x) => x.s.key === "overdue" || x.s.key === "due")
    .sort((a, b) => a.p.nextDueDate.localeCompare(b.p.nextDueDate)); // most overdue / soonest first
  if (due.length === 0) return null;

  return (
    <>
      <h2 className="text-2xl font-semibold mt-10 mb-3">Maintenance due</h2>
      <ul className="space-y-3">
        {due.map(({ p, s }) => (
          <li key={p.id}>
            <Link
              to="/ppms"
              className={
                "flex items-center justify-between gap-3 rounded-lg border bg-white p-4 shadow-sm hover:shadow " +
                (s.key === "overdue" ? "border-red-300" : "border-amber-300")
              }
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900 truncate">{p.title}</div>
                <div className="text-sm text-slate-500 mt-0.5 truncate">
                  {p.contractorName ? `${p.contractorName} · ` : ""}{frequencyLabel(p.frequencyPerYear)}
                </div>
              </div>
              <span
                className={
                  "px-2 py-0.5 text-xs font-medium rounded-full shrink-0 " +
                  (s.key === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")
                }
              >
                {s.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Ppms() {
  useTicker(1000);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["ppms"],
    queryFn: () => api<{ ppms: Ppm[] }>("/ppms"),
    refetchInterval: 30_000,
  });

  const [editing, setEditing] = useState<Ppm | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <div className="p-8 text-slate-500">Loading PPMs…</div>;
  if (error) return <div className="p-8 text-red-700">Could not load PPMs.</div>;

  const list = data?.ppms ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Planned preventive maintenance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Recurring contractor jobs. When one is due, HazardLink emails the contractor to arrange a date — you just approve it.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap"
        >
          + Add PPM
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-800">No maintenance tasks yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Add your recurring jobs (fire-extinguisher service, PAT testing, HVAC filters…)
            and HazardLink will remind your team before each one is due.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <PpmCard key={p.id} ppm={p} onClick={() => setEditing(p)} onChanged={() => qc.invalidateQueries({ queryKey: ["ppms"] })} />
          ))}
        </div>
      )}

      {(editing || creating) && (
        <PpmDialog
          ppm={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["ppms"] }); setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function PpmCard({ ppm, onClick, onChanged }: { ppm: Ppm; onClick: () => void; onChanged: () => void }) {
  const status = ppmStatus(ppm);
  const complete = useMutation({
    mutationFn: () => api(`/ppms/${ppm.id}/complete`, { method: "POST" }),
    onSuccess: onChanged,
  });

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition p-4">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={onClick} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="font-medium text-slate-900">{ppm.title}</h3>
            <StatusPill status={status.key} label={status.label} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <Field label="Frequency" value={frequencyLabel(ppm.frequencyPerYear)} />
            <Field label="Next due" value={formatDate(ppm.nextDueDate)} />
            {ppm.contractorName && <Field label="Contractor" value={ppm.contractorName} />}
            {ppm.contactPhone && <Field label="Phone" value={ppm.contactPhone} />}
            {ppm.contactEmail && <Field label="Email" value={ppm.contactEmail} />}
          </div>
          {ppm.notes && <p className="mt-2 text-sm text-slate-600 italic">📝 {ppm.notes}</p>}
          {ppm.lastCompletedAt && (
            <p className="mt-1 text-xs text-slate-500">
              Last done {formatDate(ppm.lastCompletedAt.slice(0, 10))}
            </p>
          )}
        </button>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={() => complete.mutate()}
            disabled={complete.isPending}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 rounded text-white font-medium whitespace-nowrap"
            title="Mark done — schedules the next one"
          >
            {complete.isPending ? "…" : "Mark done"}
          </button>
          <button onClick={onClick} className="text-slate-500 text-xs hover:text-slate-800">Edit →</button>
        </div>
      </div>

      <ScheduleControls ppm={ppm} onChanged={onChanged} />
    </div>
  );
}

// ─── Contractor scheduling row (under each card) ────────────────────────────

function ScheduleControls({ ppm, onChanged }: { ppm: Ppm; onChanged: () => void }) {
  const s = ppm.schedule;
  const [copied, setCopied] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () => api<{ emailDelivered: boolean; emailError: string | null }>(`/ppms/${ppm.id}/request-schedule`, { method: "POST" }),
    onSuccess: (data) => {
      setEmailErr(data?.emailDelivered ? null : (data?.emailError ?? "unknown error"));
      onChanged();
    },
    onError: (e: any) => setEmailErr(e?.payload?.error ?? "request failed"),
  });
  const confirm = useMutation({
    mutationFn: () => api(`/ppm-schedule-requests/${s!.id}/confirm`, { method: "POST" }),
    onSuccess: onChanged,
  });
  const cancel = useMutation({
    mutationFn: () => api(`/ppm-schedule-requests/${s!.id}/cancel`, { method: "POST" }),
    onSuccess: onChanged,
  });

  function copyLink(url: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Booked — show the confirmed date.
  if (ppm.scheduledDate || s?.status === "confirmed") {
    const d = ppm.scheduledDate ?? s?.confirmedDate ?? null;
    return <Bar><span className="text-emerald-700">📅 Booked for <b>{d ? formatDate(d) : "—"}</b></span></Bar>;
  }

  // Contractor proposed a date — approve or cancel.
  if (s?.status === "proposed") {
    return (
      <Bar>
        <span className="text-amber-700 min-w-0">
          Contractor proposed <b>{s.proposedDate ? formatDate(s.proposedDate) : "—"}</b>
          {s.contractorNote ? <span className="text-amber-700/70"> — “{s.contractorNote}”</span> : null}
        </span>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => confirm.mutate()} disabled={confirm.isPending}
            className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 rounded text-white font-medium">
            {confirm.isPending ? "…" : "Approve date"}
          </button>
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending}
            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800">Cancel</button>
        </div>
      </Bar>
    );
  }

  // Invite sent — awaiting reply. Offer copy-link (works even before SMTP).
  if (s?.status === "sent") {
    return (
      <Bar>
        <span className="text-slate-600 min-w-0">
          ⏳ Awaiting {ppm.contractorName ?? "contractor"}
          <span className="text-slate-500">{s.emailDelivered ? " · emailed" : " · not emailed yet — copy the link"}</span>
        </span>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => copyLink(s.scheduleUrl)}
            className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded text-slate-800">{copied ? "Copied!" : "Copy link"}</button>
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending}
            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800">Cancel</button>
        </div>
        {emailErr && <p className="w-full text-xs text-red-600 mt-1 break-all">✉️ Email send failed: {emailErr}</p>}
      </Bar>
    );
  }

  // Nothing live (none / declined / cancelled) — offer to (re)request a date.
  const declined = s?.status === "declined";
  const hasEmail = !!ppm.contactEmail;
  return (
    <Bar>
      <span className="text-slate-500 min-w-0">
        {declined
          ? <>Contractor declined{s?.contractorNote ? <span className="text-slate-500"> — “{s.contractorNote}”</span> : null}</>
          : "No date arranged yet"}
      </span>
      <button onClick={() => request.mutate()} disabled={request.isPending || !hasEmail}
        title={hasEmail ? "Email the contractor a link to pick a date" : "Add a contractor email on this task first"}
        className="ml-auto px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium">
        {request.isPending ? "…" : declined ? "Ask again" : "Request a date"}
      </button>
    </Bar>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 pt-3 border-t border-slate-200 text-sm flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-slate-500">{label}:</span>{" "}
      <span className="text-slate-900">{value}</span>
    </span>
  );
}

function StatusPill({ status, label }: { status: PpmStatusKey; label: string }) {
  const styles: Record<PpmStatusKey, string> = {
    overdue: "bg-red-100 text-red-700",
    due: "bg-amber-100 text-amber-700",
    ok: "bg-emerald-100 text-emerald-700",
    paused: "bg-slate-200 text-slate-500",
  };
  return <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + styles[status]}>{label}</span>;
}

// ─── Create / edit dialog ────────────────────────────────────────────────────

function PpmDialog({ ppm, onClose, onSaved }: { ppm: Ppm | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!ppm;
  const qc = useQueryClient();

  const [title, setTitle] = useState(ppm?.title ?? "");
  const [notes, setNotes] = useState(ppm?.notes ?? "");
  const [contractorName, setContractorName] = useState(ppm?.contractorName ?? "");
  const [contactPhone, setContactPhone] = useState(ppm?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(ppm?.contactEmail ?? "");
  const [frequencyPerYear, setFrequencyPerYear] = useState(ppm?.frequencyPerYear ?? 1);
  const [nextDueDate, setNextDueDate] = useState(ppm?.nextDueDate ?? todayPlusDaysISO(30));
  const [reminderLeadDays, setReminderLeadDays] = useState(ppm?.reminderLeadDays ?? 14);
  const [active, setActive] = useState(ppm?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const payload = () => ({
    title: title.trim(),
    notes: notes.trim() || null,
    contractorName: contractorName.trim() || null,
    contactPhone: contactPhone.trim() || null,
    contactEmail: contactEmail.trim() || null,
    frequencyPerYear,
    nextDueDate,
    reminderLeadDays,
    active,
  });

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? api(`/ppms/${ppm!.id}`, { method: "PATCH", body: JSON.stringify(payload()) })
        : api("/ppms", { method: "POST", body: JSON.stringify(payload()) }),
    onSuccess: onSaved,
    onError: (err: unknown) => {
      const e = err as { status?: number; payload?: { details?: Record<string, string[]> } };
      const first = e?.payload?.details ? Object.values(e.payload.details).flat()[0] : null;
      setError(first || "Couldn't save — check the fields and try again.");
    },
  });

  const complete = useMutation({
    mutationFn: () => api(`/ppms/${ppm!.id}/complete`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ppms"] }); onSaved(); },
  });

  const remove = useMutation({
    mutationFn: () => api(`/ppms/${ppm!.id}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  const titleValid = title.trim().length > 0;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(nextDueDate);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{isEdit ? "Edit PPM" : "Add PPM"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <Section title="What needs doing">
            <FieldGroup label="Task title">
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200}
                placeholder="e.g. Annual fire-extinguisher service"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
              />
            </FieldGroup>
            <FieldGroup label="Details / notes (optional)">
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                placeholder="Scope, access notes, anything the contractor needs to know"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm resize-none"
              />
            </FieldGroup>
          </Section>

          <Section title="Contractor">
            <FieldGroup label="Company name">
              <input
                type="text" value={contractorName} onChange={(e) => setContractorName(e.target.value)} maxLength={200}
                placeholder="e.g. Cork Fire & Safety Ltd"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
              />
            </FieldGroup>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldGroup label="Phone">
                <input
                  type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={50}
                  placeholder="e.g. 021 123 4567"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
                />
              </FieldGroup>
              <FieldGroup label="Email">
                <input
                  type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={200}
                  placeholder="e.g. service@contractor.ie"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
                />
              </FieldGroup>
            </div>
          </Section>

          <Section title="Schedule">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldGroup label="How often?">
                <select
                  value={frequencyPerYear} onChange={(e) => setFrequencyPerYear(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
                >
                  {FREQ_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Next due date">
                <input
                  type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
                />
              </FieldGroup>
            </div>
            <FieldGroup label="Remind this many days before it's due">
              <input
                type="number" min={0} max={365} value={reminderLeadDays}
                onChange={(e) => setReminderLeadDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                className="w-32 px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">First reminder fires this far ahead, then daily once overdue.</p>
            </FieldGroup>
            {isEdit && (
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-slate-100 cursor-pointer" />
                <span className="text-slate-900 text-sm">Active (uncheck to pause reminders)</span>
              </label>
            )}
          </Section>

          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          {isEdit ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700">Delete this PPM?</span>
                <button onClick={() => remove.mutate()} disabled={remove.isPending}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-slate-200 rounded text-white">
                  {remove.isPending ? "…" : "Delete"}
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => complete.mutate()} disabled={complete.isPending}
                  className="px-3 py-1.5 text-sm text-emerald-700 hover:text-emerald-700 hover:bg-emerald-950/30 rounded">
                  {complete.isPending ? "…" : "Mark done"}
                </button>
                <button onClick={() => setConfirmingDelete(true)}
                  className="px-3 py-1.5 text-sm text-red-700 hover:text-red-700 hover:bg-red-950/30 rounded">Delete</button>
              </div>
            )
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
            <button
              onClick={() => { setError(null); save.mutate(); }}
              disabled={!titleValid || !dateValid || save.isPending}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium"
            >
              {save.isPending ? "Saving…" : isEdit ? "Save" : "Add PPM"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
