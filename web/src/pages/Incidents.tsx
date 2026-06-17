import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Security — incident reporting. Guards/staff log on-site incidents (intruder,
 * theft, damage, safety hazard…), triage by severity, and resolve. Tied to a
 * building so it shares the site model with cleaning + maintenance.
 */

type Severity = "low" | "medium" | "high" | "critical";
type Status = "open" | "investigating" | "resolved";

interface Incident {
  id: string;
  buildingId: string | null;
  building: { id: string; name: string } | null;
  kind: string | null;
  severity: Severity;
  status: Status;
  title: string;
  description: string | null;
  occurredAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  raisedJobId: string | null;
  createdAt: string;
}
interface Building { id: string; name: string }

const KINDS = ["Intruder / trespasser", "Theft", "Vandalism / damage", "Suspicious activity", "Access breach", "Safety hazard", "Medical", "Other"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const STATUSES: Status[] = ["open", "investigating", "resolved"];

const sevCls: Record<Severity, string> = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};
const statusCls: Record<Status, string> = {
  open: "bg-red-100 text-red-700",
  investigating: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Incidents() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["incidents"], queryFn: () => api<{ incidents: Incident[] }>("/incidents") });
  const buildingsQ = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const buildings = buildingsQ.data?.buildings ?? [];

  const [editing, setEditing] = useState<Incident | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <div className="p-8 text-slate-500">Loading incidents…</div>;
  if (error) return <div className="p-8 text-red-600">Could not load incidents.</div>;

  const list = data?.incidents ?? [];
  const open = list.filter((i) => i.status !== "resolved");
  const resolved = list.filter((i) => i.status === "resolved");

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Security incidents</h1>
          <p className="text-sm text-slate-500 mt-1">Log and track on-site incidents — intruders, theft, damage, safety hazards.</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap">+ Log incident</button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-800">No incidents logged.</p>
          <p className="text-sm text-slate-500 mt-2">Log anything that happens on site so it's recorded, triaged, and followed up.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Group title={`Open (${open.length})`} items={open} onClick={setEditing} />
          {resolved.length > 0 && <Group title={`Resolved (${resolved.length})`} items={resolved} onClick={setEditing} />}
        </div>
      )}

      {(editing || creating) && (
        <IncidentDialog
          incident={editing} buildings={buildings}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["incidents"] }); setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function Group({ title, items, onClick }: { title: string; items: Incident[]; onClick: (i: Incident) => void }) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">{title}</h2>
      <div className="space-y-3">
        {items.map((i) => (
          <button key={i.id} onClick={() => onClick(i)} className="w-full text-left rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition p-4">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h3 className="font-medium text-slate-900">{i.title}</h3>
              <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + sevCls[i.severity]}>{i.severity}</span>
              <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + statusCls[i.status]}>{i.status}</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {i.kind && <Field label="Type" value={i.kind} />}
              {i.building && <Field label="Site" value={i.building.name} />}
              <Field label="When" value={fmtDateTime(i.occurredAt ?? i.createdAt)} />
            </div>
            {i.description && <p className="mt-2 text-sm text-slate-600 line-clamp-2">{i.description}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <span><span className="text-slate-500">{label}:</span> <span className="text-slate-900">{value}</span></span>;
}

function IncidentDialog({ incident, buildings, onClose, onSaved }: {
  incident: Incident | null; buildings: Building[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!incident;
  const [title, setTitle] = useState(incident?.title ?? "");
  const [kind, setKind] = useState(incident?.kind ?? "");
  const [severity, setSeverity] = useState<Severity>(incident?.severity ?? "medium");
  const [status, setStatus] = useState<Status>(incident?.status ?? "open");
  const [buildingId, setBuildingId] = useState(incident?.buildingId ?? "");
  const [occurredAt, setOccurredAt] = useState(incident?.occurredAt ? incident.occurredAt.slice(0, 16) : "");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [resolutionNote, setResolutionNote] = useState(incident?.resolutionNote ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function body() {
    return {
      title: title.trim(),
      kind: kind || null,
      severity,
      buildingId: buildingId || null,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
      description: description.trim() || null,
      ...(isEdit ? { status, resolutionNote: resolutionNote.trim() || null } : {}),
    };
  }

  const save = useMutation({
    mutationFn: () => isEdit
      ? api(`/incidents/${incident!.id}`, { method: "PATCH", body: JSON.stringify(body()) })
      : api("/incidents", { method: "POST", body: JSON.stringify(body()) }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the fields and try again."),
  });
  const raiseJob = useMutation({
    mutationFn: () => api(`/incidents/${incident!.id}/raise-job`, { method: "POST" }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't raise a job — try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{isEdit ? "Incident" : "Log incident"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Group2 label="What happened?">
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} placeholder="e.g. Rear fire door found propped open" className={inp} />
          </Group2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group2 label="Type">
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={inp}>
                <option value="">— Select —</option>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Group2>
            <Group2 label="Severity">
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className={inp}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Group2>
            <Group2 label="Site / building">
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={inp}>
                <option value="">— None —</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Group2>
            <Group2 label="When it happened">
              <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={inp} />
            </Group2>
          </div>
          <Group2 label="Details">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} placeholder="What you saw, who was involved, action taken…" className={inp + " resize-none"} />
          </Group2>

          {isEdit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <Group2 label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={inp}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Group2>
              <Group2 label="Resolution note">
                <input value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} maxLength={2000} placeholder="How it was dealt with" className={inp} />
              </Group2>
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-2">
          {isEdit ? (
            incident!.raisedJobId
              ? <span className="text-sm text-emerald-700">🔧 Maintenance job raised</span>
              : <button onClick={() => { setErr(null); raiseJob.mutate(); }} disabled={raiseJob.isPending} className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 rounded">{raiseJob.isPending ? "…" : "🔧 Raise maintenance job"}</button>
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
            <button onClick={() => { setErr(null); save.mutate(); }} disabled={!title.trim() || save.isPending} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium">
              {save.isPending ? "Saving…" : isEdit ? "Save" : "Log incident"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm";

function Group2({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-500 mb-1">{label}</label>{children}</div>;
}
