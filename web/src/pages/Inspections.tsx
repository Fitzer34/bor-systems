import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PhotoUpload, PhotoThumb } from "../components/PhotoUpload";

/**
 * Cleaning quality inspections. Run a checklist (score each item), attach
 * tamper-evident photo proof, submit, and get an overall score; supervisors can
 * turn a failed item into a maintenance job.
 */

type Rating = "meets" | "acceptable" | "needs_improvement" | "na";

interface Inspection {
  id: string; buildingId: string | null; building: { id: string; name: string } | null;
  area: string | null; inspectorName: string | null; score: number | null; note: string | null; createdAt: string;
}
interface Item { id: string; label: string; rating: Rating; note: string | null; photoUrl: string | null; raisedJobId: string | null }
interface Building { id: string; name: string }

const RATINGS: { v: Rating; label: string; on: string }[] = [
  { v: "meets", label: "Meets", on: "bg-emerald-600 text-white border-emerald-600" },
  { v: "acceptable", label: "OK", on: "bg-slate-600 text-white border-slate-600" },
  { v: "needs_improvement", label: "Fail", on: "bg-red-600 text-white border-red-600" },
  { v: "na", label: "N/A", on: "bg-slate-400 text-white border-slate-400" },
];
const DEFAULT_ITEMS = ["Floors", "Restrooms", "Bins emptied", "Surfaces & desks", "Glass & mirrors", "Kitchen / break area"];

function scoreCls(s: number | null): string {
  if (s == null) return "bg-slate-200 text-slate-600";
  if (s >= 90) return "bg-emerald-100 text-emerald-700";
  if (s >= 70) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function Inspections() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["inspections"], queryFn: () => api<{ inspections: Inspection[] }>("/inspections") });
  const buildingsQ = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Inspection | null>(null);

  if (isLoading) return <div className="p-8 text-slate-500">Loading inspections…</div>;
  if (error) return <div className="p-8 text-red-600">Could not load inspections.</div>;
  const list = data?.inspections ?? [];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Cleaning inspections</h1>
          <p className="text-sm text-slate-500 mt-1">Score a walk-through; failed items can become maintenance jobs.</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap">+ New inspection</button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-800">No inspections yet.</p>
          <p className="text-sm text-slate-500 mt-2">Run a quality walk-through — score each area, and any fails turn into tracked work.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((i) => (
            <button key={i.id} onClick={() => setViewing(i)} className="w-full text-left rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition p-4 flex items-center gap-4">
              <span className={"px-2.5 py-1 text-sm font-semibold rounded-full shrink-0 " + scoreCls(i.score)}>{i.score == null ? "—" : `${i.score}%`}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{i.building?.name ?? "No site"}{i.area ? ` · ${i.area}` : ""}</div>
                <div className="text-xs text-slate-500 mt-0.5">{i.inspectorName ? `${i.inspectorName} · ` : ""}{fmtDate(i.createdAt)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <NewInspectionModal
          buildings={buildingsQ.data?.buildings ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["inspections"] }); setCreating(false); }}
        />
      )}
      {viewing && <DetailModal inspection={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function NewInspectionModal({ buildings, onClose, onSaved }: { buildings: Building[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [buildingId, setBuildingId] = useState("");
  const [area, setArea] = useState("");
  const [items, setItems] = useState<{ label: string; rating: Rating; note: string; photo: string }[]>(
    DEFAULT_ITEMS.map((label) => ({ label, rating: "meets", note: "", photo: "" })),
  );
  const [newLabel, setNewLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setRating = (i: number, r: Rating) => setItems((arr) => arr.map((it, n) => (n === i ? { ...it, rating: r } : it)));
  const setNote = (i: number, v: string) => setItems((arr) => arr.map((it, n) => (n === i ? { ...it, note: v } : it)));
  const setPhoto = (i: number, v: string) => setItems((arr) => arr.map((it, n) => (n === i ? { ...it, photo: v } : it)));
  const remove = (i: number) => setItems((arr) => arr.filter((_, n) => n !== i));

  const scored = items.filter((i) => i.rating !== "na");
  const SCORE: Record<string, number> = { meets: 100, acceptable: 70, needs_improvement: 0 };
  const liveScore = scored.length ? Math.round(scored.reduce((s, i) => s + (SCORE[i.rating] ?? 0), 0) / scored.length) : null;

  const save = useMutation({
    mutationFn: () => api("/inspections", { method: "POST", body: JSON.stringify({
      buildingId: buildingId || null,
      area: area.trim() || undefined,
      inspectorName: user?.name,
      items: items.map((i) => ({ label: i.label.trim(), rating: i.rating, note: i.note.trim() || undefined, photoUrl: i.photo || undefined })),
    }) }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the items and try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">New inspection</h2>
          <span className={"px-2.5 py-1 text-sm font-semibold rounded-full " + scoreCls(liveScore)}>{liveScore == null ? "—" : `${liveScore}%`}</span>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-500 mb-1">Site / building</label>
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={inp}>
                <option value="">— None —</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Area (optional)</label>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Level 2 offices" className={inp} />
            </div>
          </div>

          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-slate-900">{it.label}</span>
                  <div className="flex gap-1">
                    {RATINGS.map((r) => (
                      <button key={r.v} onClick={() => setRating(i, r.v)}
                        className={"px-2 py-1 text-xs rounded border " + (it.rating === r.v ? r.on : "bg-white text-slate-600 border-slate-300")}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => remove(i)} className="text-slate-400 hover:text-red-600 text-lg leading-none px-1" aria-label="Remove">×</button>
                </div>
                {it.rating === "needs_improvement" && (
                  <input value={it.note} onChange={(e) => setNote(i, e.target.value)} placeholder="What's the issue?" className={"mt-2 " + inp} />
                )}
                <div className="mt-2">
                  <PhotoUpload url={it.photo || null} onUploaded={(u) => setPhoto(i, u)} label="photo proof" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Add a checklist item…" className={inp}
              onKeyDown={(e) => { if (e.key === "Enter" && newLabel.trim()) { setItems((a) => [...a, { label: newLabel.trim(), rating: "meets", note: "", photo: "" }]); setNewLabel(""); } }} />
            <button onClick={() => { if (newLabel.trim()) { setItems((a) => [...a, { label: newLabel.trim(), rating: "meets", note: "", photo: "" }]); setNewLabel(""); } }} className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded text-slate-700 whitespace-nowrap">Add</button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={() => { setErr(null); save.mutate(); }} disabled={items.length === 0 || save.isPending} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium">
            {save.isPending ? "Saving…" : "Submit inspection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ inspection, onClose }: { inspection: Inspection; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  const detailQ = useQuery({ queryKey: ["inspection", inspection.id], queryFn: () => api<{ inspection: Inspection; items: Item[] }>(`/inspections/${inspection.id}`) });
  const raise = useMutation({
    mutationFn: (itemId: string) => api(`/inspection-items/${itemId}/raise-job`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspection", inspection.id] }),
  });

  const ratingLabel: Record<Rating, string> = { meets: "Meets", acceptable: "OK", needs_improvement: "Fail", na: "N/A" };
  const ratingCls: Record<Rating, string> = {
    meets: "bg-emerald-100 text-emerald-700", acceptable: "bg-slate-200 text-slate-600",
    needs_improvement: "bg-red-100 text-red-700", na: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-900">{inspection.building?.name ?? "Inspection"}{inspection.area ? ` · ${inspection.area}` : ""}</h2>
            <div className="text-xs text-slate-500">{inspection.inspectorName ? `${inspection.inspectorName} · ` : ""}{fmtDate(inspection.createdAt)}</div>
          </div>
          <span className={"px-2.5 py-1 text-sm font-semibold rounded-full " + scoreCls(inspection.score)}>{inspection.score == null ? "—" : `${inspection.score}%`}</span>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {!detailQ.data ? <p className="text-slate-500">Loading…</p> : (
            <div className="space-y-2">
              {detailQ.data.items.map((it) => (
                <div key={it.id} className="flex items-start gap-3 text-sm border-b border-slate-100 pb-2">
                  <span className={"px-2 py-0.5 text-xs font-medium rounded-full shrink-0 " + ratingCls[it.rating]}>{ratingLabel[it.rating]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-900">{it.label}</div>
                    {it.note && <div className="text-xs text-slate-500">{it.note}</div>}
                    {it.photoUrl && <div className="mt-1"><PhotoThumb url={it.photoUrl} /></div>}
                  </div>
                  {it.rating === "needs_improvement" && (
                    it.raisedJobId
                      ? <span className="text-xs text-emerald-700 shrink-0">🔧 job raised</span>
                      : isStaff && <button onClick={() => raise.mutate(it.id)} disabled={raise.isPending} className="text-xs text-blue-700 hover:underline shrink-0">Raise job</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm";
