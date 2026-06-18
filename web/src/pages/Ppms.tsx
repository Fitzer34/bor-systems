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

export interface Building {
  id: string;
  name: string;
  address: string | null;
  siteContactName: string | null;
  siteContactPhone: string | null;
  siteContactEmail: string | null;
}

export interface Ppm {
  id: string;
  title: string;
  buildingId: string | null;
  building: Building | null;
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
        "flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-xl border text-sm " +
        (overdue > 0
          ? "bg-red-50 border-red-300 text-red-700"
          : "bg-amber-50 border-amber-300 text-amber-700")
      }
    >
      <span className="flex items-center gap-2 min-w-0">
        <WrenchIcon />
        <span className="min-w-0"><span className="font-medium">Maintenance:</span> {parts.join(" · ")} — review planned preventive maintenance.</span>
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
                "card card-hover flex items-center justify-between gap-3 " +
                (s.key === "overdue" ? "border-red-300" : "border-amber-300")
              }
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900 truncate">{p.title}</div>
                <div className="text-sm text-slate-500 mt-0.5 truncate">
                  {p.contractorName ? `${p.contractorName} · ` : ""}{frequencyLabel(p.frequencyPerYear)}
                </div>
              </div>
              <span className={(s.key === "overdue" ? "pill-alert" : "pill-offline") + " shrink-0"}>
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
          className="btn-primary whitespace-nowrap"
        >
          Add PPM
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-900 font-medium">No maintenance tasks yet.</p>
          <p className="text-sm text-slate-500 mt-1">
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
    <div className="card w-full">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={onClick} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="font-medium text-slate-900">{ppm.title}</h3>
            <StatusPill status={status.key} label={status.label} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <Field label="Frequency" value={frequencyLabel(ppm.frequencyPerYear)} />
            <Field label="Next due" value={formatDate(ppm.nextDueDate)} />
            {ppm.building && <Field label="Site" value={ppm.building.name} />}
            {ppm.contractorName && <Field label="Contractor" value={ppm.contractorName} />}
            {ppm.contactPhone && <Field label="Phone" value={ppm.contactPhone} />}
            {ppm.contactEmail && <Field label="Email" value={ppm.contactEmail} />}
          </div>
          {ppm.notes && (
            <p className="mt-2 text-sm text-slate-600 italic flex items-start gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              <span>{ppm.notes}</span>
            </p>
          )}
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
            className="btn-secondary whitespace-nowrap"
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
    return <Bar><span className="inline-flex items-center gap-1.5 text-emerald-700"><CalendarIcon /> Booked for <b>{d ? formatDate(d) : "—"}</b></span></Bar>;
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
          <button onClick={() => confirm.mutate()} disabled={confirm.isPending} className="btn-primary">
            {confirm.isPending ? "…" : "Approve date"}
          </button>
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="btn-ghost">Cancel</button>
        </div>
      </Bar>
    );
  }

  // Invite sent — awaiting reply. Offer copy-link (works even before SMTP).
  if (s?.status === "sent") {
    return (
      <Bar>
        <span className="inline-flex items-center gap-1.5 text-slate-600 min-w-0">
          <ClockIcon /> Awaiting {ppm.contractorName ?? "contractor"}
          <span className="text-slate-500">{s.emailDelivered ? " · emailed" : " · not emailed yet — copy the link"}</span>
        </span>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => copyLink(s.scheduleUrl)} className="btn-secondary">{copied ? "Copied!" : "Copy link"}</button>
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="btn-ghost">Cancel</button>
        </div>
        {emailErr && <p className="w-full text-xs text-red-600 mt-1 break-all">Email send failed: {emailErr}</p>}
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
        className="btn-primary ml-auto">
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
    overdue: "pill-alert",
    due: "pill-offline",
    ok: "pill-online",
    paused: "pill-muted",
  };
  return <span className={styles[status]}>{label}</span>;
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

  // Site + on-site contact live on the building. Pick one (or add it), and the
  // address/contact below are saved onto that building.
  const [buildingChoice, setBuildingChoice] = useState<string>(ppm?.building?.id ?? "");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [addr, setAddr] = useState(ppm?.building?.address ?? "");
  const [scName, setScName] = useState(ppm?.building?.siteContactName ?? "");
  const [scPhone, setScPhone] = useState(ppm?.building?.siteContactPhone ?? "");
  const [scEmail, setScEmail] = useState(ppm?.building?.siteContactEmail ?? "");

  const buildingsQuery = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const buildings = buildingsQuery.data?.buildings ?? [];

  // Switching building prefills the address/contact from that building's saved values.
  function selectBuilding(val: string) {
    setBuildingChoice(val);
    if (val === "__new__" || val === "") {
      setAddr(""); setScName(""); setScPhone(""); setScEmail("");
      return;
    }
    const b = buildings.find((x) => x.id === val);
    setAddr(b?.address ?? ""); setScName(b?.siteContactName ?? "");
    setScPhone(b?.siteContactPhone ?? ""); setScEmail(b?.siteContactEmail ?? "");
  }

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
    mutationFn: async () => {
      // Resolve the building: create it if "new", else use the selection.
      let buildingId: string | null = buildingChoice && buildingChoice !== "__new__" ? buildingChoice : null;
      if (buildingChoice === "__new__" && newBuildingName.trim()) {
        const res = await api<{ building: { id: string } }>("/buildings", {
          method: "POST", body: JSON.stringify({ name: newBuildingName.trim() }),
        });
        buildingId = res.building.id;
      }
      // Save the site address + on-site contact onto the building (reused everywhere).
      if (buildingId) {
        await api(`/buildings/${buildingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            address: addr.trim() || null,
            siteContactName: scName.trim() || null,
            siteContactPhone: scPhone.trim() || null,
            siteContactEmail: scEmail.trim() || null,
          }),
        });
      }
      const body = JSON.stringify({ ...payload(), buildingId });
      return isEdit
        ? api(`/ppms/${ppm!.id}`, { method: "PATCH", body })
        : api("/ppms", { method: "POST", body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["buildings"] }); onSaved(); },
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
                className="input"
              />
            </FieldGroup>
            <FieldGroup label="Details / notes (optional)">
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                placeholder="Scope, access notes, anything the contractor needs to know"
                className="input resize-none"
              />
            </FieldGroup>
          </Section>

          <Section title="Site & on-site contact">
            <FieldGroup label="Building / site">
              <select
                value={buildingChoice} onChange={(e) => selectBuilding(e.target.value)}
                className="input"
              >
                <option value="">— None —</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="__new__">+ Add a new building…</option>
              </select>
            </FieldGroup>
            {buildingChoice === "__new__" && (
              <FieldGroup label="New building name">
                <input
                  type="text" value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} maxLength={200}
                  placeholder="e.g. Riverside House"
                  className="input"
                />
              </FieldGroup>
            )}
            {buildingChoice && (buildingChoice !== "__new__" || newBuildingName.trim()) && (
              <>
                <FieldGroup label="Address / how to find it">
                  <input
                    type="text" value={addr} onChange={(e) => setAddr(e.target.value)} maxLength={500}
                    placeholder="e.g. 12 Main St, Cork — deliveries to rear entrance"
                    className="input"
                  />
                </FieldGroup>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FieldGroup label="On-site contact">
                    <input type="text" value={scName} onChange={(e) => setScName(e.target.value)} maxLength={200}
                      placeholder="Name" className="input" />
                  </FieldGroup>
                  <FieldGroup label="Phone">
                    <input type="tel" value={scPhone} onChange={(e) => setScPhone(e.target.value)} maxLength={50}
                      placeholder="Phone" className="input" />
                  </FieldGroup>
                  <FieldGroup label="Email">
                    <input type="email" value={scEmail} onChange={(e) => setScEmail(e.target.value)} maxLength={200}
                      placeholder="Email" className="input" />
                  </FieldGroup>
                </div>
                <p className="text-xs text-slate-500">Saved on the building and reused for every job here — and sent to the contractor so they know where to go and who to meet.</p>
              </>
            )}
          </Section>

          <Section title="Contractor">
            <FieldGroup label="Company name">
              <input
                type="text" value={contractorName} onChange={(e) => setContractorName(e.target.value)} maxLength={200}
                placeholder="e.g. Cork Fire & Safety Ltd"
                className="input"
              />
            </FieldGroup>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldGroup label="Phone">
                <input
                  type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={50}
                  placeholder="e.g. 021 123 4567"
                  className="input"
                />
              </FieldGroup>
              <FieldGroup label="Email">
                <input
                  type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={200}
                  placeholder="e.g. service@contractor.ie"
                  className="input"
                />
              </FieldGroup>
            </div>
          </Section>

          <Section title="Schedule">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldGroup label="How often?">
                <select
                  value={frequencyPerYear} onChange={(e) => setFrequencyPerYear(Number(e.target.value))}
                  className="input"
                >
                  {FREQ_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Next due date">
                <input
                  type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)}
                  className="input"
                />
              </FieldGroup>
            </div>
            <FieldGroup label="Remind this many days before it's due">
              <input
                type="number" min={0} max={365} value={reminderLeadDays}
                onChange={(e) => setReminderLeadDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                className="input !w-32"
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
                <button onClick={() => remove.mutate()} disabled={remove.isPending} className="btn-danger">
                  {remove.isPending ? "…" : "Delete"}
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="btn-ghost">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => complete.mutate()} disabled={complete.isPending} className="btn-ghost">
                  {complete.isPending ? "…" : "Mark done"}
                </button>
                <button onClick={() => setConfirmingDelete(true)} className="btn-danger">Delete</button>
              </div>
            )
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button
              onClick={() => { setError(null); save.mutate(); }}
              disabled={!titleValid || !dateValid || save.isPending}
              className="btn-primary"
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
      <h3 className="section-title">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
    </svg>
  );
}
