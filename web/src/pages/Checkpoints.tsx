import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../lib/api";
import { useSection } from "../lib/section";

/**
 * Checkpoints — shared by two sections. On the Security side these are guard
 * tour points (patrols); on the Cleaning side they're cleaning rounds (a cleaner
 * surveys an area, confirms it's clean, and photographs it). Define QR-tagged
 * points at a site; print the QR and stick it up; staff scan it on their round
 * (no login) and each scan is logged here. The active section scopes the list.
 */

interface Checkpoint {
  id: string;
  name: string;
  buildingId: string | null;
  building: { id: string; name: string } | null;
  locationNote: string | null;
  instructions: string | null;
  token: string;
  scanUrl: string;
  active: boolean;
}
interface Scan {
  id: string;
  guardName: string | null;
  note: string | null;
  photoUrl: string | null;
  flagged: boolean;
  scannedAt: string;
  checkpointName: string | null;
  buildingName: string | null;
}
interface Building { id: string; name: string }

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function Checkpoints() {
  const qc = useQueryClient();
  const { section } = useSection();
  // This page is shared by Cleaning + Security — scope everything to the side
  // the user is currently in so cleaning rounds and guard patrols stay separate.
  const discipline: "cleaning" | "security" = section === "cleaning" ? "cleaning" : "security";
  const isCleaning = discipline === "cleaning";

  const cps = useQuery({ queryKey: ["checkpoints", discipline], queryFn: () => api<{ checkpoints: Checkpoint[] }>(`/checkpoints?discipline=${discipline}`) });
  const scans = useQuery({ queryKey: ["checkpoint-scans", discipline], queryFn: () => api<{ scans: Scan[] }>(`/checkpoint-scans?discipline=${discipline}`), refetchInterval: 30_000 });
  const buildingsQ = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const buildings = buildingsQ.data?.buildings ?? [];

  const [editing, setEditing] = useState<Checkpoint | null>(null);
  const [creating, setCreating] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (cps.isLoading) return <div className="p-8 text-slate-500">Loading checkpoints…</div>;
  if (cps.error) return <div className="p-8 text-red-600">Could not load checkpoints.</div>;

  const list = (cps.data?.checkpoints ?? []).filter((c) => c.active);
  const scanList = scans.data?.scans ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{isCleaning ? "Cleaning rounds" : "Guard checkpoints"}</h1>
          <p className="text-sm text-slate-500 mt-1">{isCleaning
            ? "Print a checkpoint's QR and place it in each area. Cleaners scan it on their round, confirm it's clean, and add a photo — every scan is logged below."
            : "Print a checkpoint's QR and place it on site. Guards scan it on patrol — every scan is logged below."}</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap">{isCleaning ? "+ Add area" : "+ Add checkpoint"}</button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-800">{isCleaning ? "No cleaning rounds yet." : "No checkpoints yet."}</p>
          <p className="text-sm text-slate-500 mt-2">{isCleaning
            ? "Add areas cleaners should survey (washrooms, lobby, kitchen, stairwells…) and print each QR."
            : "Add points guards should visit (fire exits, plant rooms, perimeter gates…) and print each QR."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((c) => <CheckpointCard key={c.id} cp={c} onEdit={() => setEditing(c)} />)}
        </div>
      )}

      <h2 className="text-xs uppercase tracking-wider text-slate-500 mt-10 mb-2">{isCleaning ? "Recent rounds" : "Recent patrols"}</h2>
      {scanList.length === 0 ? (
        <p className="text-sm text-slate-500">No scans yet.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {scanList.map((s) => (
            <div key={s.id} className="px-4 py-2.5 flex items-center gap-3 text-sm flex-wrap">
              {s.flagged
                ? <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">⚑ Issue</span>
                : <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">✓ Clear</span>}
              <span className="font-medium text-slate-900">{s.checkpointName ?? "—"}</span>
              {s.buildingName && <span className="text-slate-500">· {s.buildingName}</span>}
              <span className="text-slate-500">· {s.guardName || (isCleaning ? "Cleaner" : "Guard")}</span>
              <span className="text-slate-400 ml-auto">{fmtDateTime(s.scannedAt)}</span>
              {s.note && <span className="w-full text-slate-600">“{s.note}”</span>}
              {s.photoUrl && (
                <button
                  onClick={() => setLightbox(s.photoUrl)}
                  className="mt-1 shrink-0"
                  title="View photo"
                >
                  <img src={s.photoUrl} alt="Area proof" loading="lazy"
                    className="h-16 w-16 rounded-lg object-cover border border-slate-200 hover:ring-2 hover:ring-blue-400 transition" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <CheckpointDialog
          cp={editing} buildings={buildings} discipline={discipline} isCleaning={isCleaning}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["checkpoints"] }); setEditing(null); setCreating(false); }}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Area proof" className="max-h-[90vh] max-w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute top-4 right-5 text-white/80 hover:text-white text-4xl leading-none">×</button>
        </div>
      )}
    </div>
  );
}

function CheckpointCard({ cp, onEdit }: { cp: Checkpoint; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex gap-4">
      <div className="shrink-0 bg-white p-1.5 border border-slate-200 rounded">
        <QRCodeSVG value={cp.scanUrl} size={84} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-900">{cp.name}</div>
        <div className="text-sm text-slate-500 mt-0.5">
          {cp.building?.name ?? "No site"}{cp.locationNote ? ` · ${cp.locationNote}` : ""}
        </div>
        {cp.instructions && <div className="text-sm text-slate-600 mt-1 line-clamp-2">📋 {cp.instructions}</div>}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { navigator.clipboard?.writeText(cp.scanUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
            className="text-xs text-blue-700 hover:underline"
          >{copied ? "Copied!" : "Copy link"}</button>
          <button onClick={onEdit} className="text-xs text-slate-500 hover:text-slate-800">Edit</button>
        </div>
      </div>
    </div>
  );
}

function CheckpointDialog({ cp, buildings, discipline, isCleaning, onClose, onSaved }: {
  cp: Checkpoint | null; buildings: Building[]; discipline: "cleaning" | "security"; isCleaning: boolean; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!cp;
  const [name, setName] = useState(cp?.name ?? "");
  const [buildingId, setBuildingId] = useState(cp?.buildingId ?? "");
  const [locationNote, setLocationNote] = useState(cp?.locationNote ?? "");
  const [instructions, setInstructions] = useState(cp?.instructions ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bodyJson = () => JSON.stringify({
    name: name.trim(),
    buildingId: buildingId || null,
    locationNote: locationNote.trim() || null,
    instructions: instructions.trim() || null,
    // Discipline is fixed at creation (a round can't switch sides); only sent on create.
    ...(isEdit ? {} : { discipline }),
  });

  const save = useMutation({
    mutationFn: () => isEdit
      ? api(`/checkpoints/${cp!.id}`, { method: "PATCH", body: bodyJson() })
      : api("/checkpoints", { method: "POST", body: bodyJson() }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the fields and try again."),
  });
  const deactivate = useMutation({
    mutationFn: () => api(`/checkpoints/${cp!.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) }),
    onSuccess: onSaved,
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{isEdit ? (isCleaning ? "Edit area" : "Edit checkpoint") : (isCleaning ? "Add cleaning area" : "Add checkpoint")}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Group label={isCleaning ? "Area name" : "Checkpoint name"}>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={160} placeholder={isCleaning ? "e.g. Ground-floor washroom" : "e.g. Rear fire exit"} className={inp} />
          </Group>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group label="Site / building">
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={inp}>
                <option value="">— None —</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Group>
            <Group label="Location note">
              <input value={locationNote} onChange={(e) => setLocationNote(e.target.value)} maxLength={300} placeholder="e.g. Level 2, by the lift" className={inp} />
            </Group>
          </div>
          <Group label="Instructions on scan (optional)">
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={2000} placeholder={isCleaning ? "What the cleaner should check / do here — shown when they scan." : "What the guard should check / do here — shown when they scan."} className={inp + " resize-none"} />
          </Group>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          {isEdit
            ? <button onClick={() => deactivate.mutate()} disabled={deactivate.isPending} className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded">{deactivate.isPending ? "…" : "Deactivate"}</button>
            : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
            <button onClick={() => { setErr(null); save.mutate(); }} disabled={!name.trim() || save.isPending} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium">
              {save.isPending ? "Saving…" : isEdit ? "Save" : (isCleaning ? "Add area" : "Add checkpoint")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm";

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-500 mb-1">{label}</label>{children}</div>;
}
