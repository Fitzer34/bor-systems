import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Predictive maintenance — usage meters. Track runtime hours / cycles / km per
 * asset; each reading updates the meter, and when it passes its service interval
 * it shows as due. Maintenance driven by actual usage, not just the calendar.
 */

type Status = "due" | "due_soon" | "ok" | "tracking";
interface Meter {
  id: string; assetId: string; name: string; unit: string | null;
  intervalValue: number | null; lastServiceValue: number; currentValue: number;
  lastReadingAt: string | null; assetName: string | null;
  nextServiceAt: number | null; remaining: number | null; pct: number | null; status: Status;
}
interface AssetLite { id: string; name: string }

const STATUS: Record<Status, { label: string; badge: string; bar: string }> = {
  due: { label: "Service due", badge: "pill-alert", bar: "bg-red-500" },
  due_soon: { label: "Due soon", badge: "pill-offline", bar: "bg-amber-500" },
  ok: { label: "OK", badge: "pill-online", bar: "bg-emerald-500" },
  tracking: { label: "Tracking", badge: "pill-muted", bar: "bg-slate-400" },
};
const RANK: Record<Status, number> = { due: 0, due_soon: 1, ok: 2, tracking: 3 };
const fmt = (n: number) => n.toLocaleString();

export function Meters() {
  const qc = useQueryClient();
  const metersQ = useQuery({ queryKey: ["meters"], queryFn: () => api<{ meters: Meter[] }>("/meters") });
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: () => api<{ assets: AssetLite[] }>("/assets") });
  const assets = assetsQ.data?.assets ?? [];

  const [adding, setAdding] = useState(false);
  const [reading, setReading] = useState<Meter | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["meters"] });
  const service = useMutation({
    mutationFn: (id: string) => api(`/meters/${id}/service`, { method: "POST" }),
    onSuccess: invalidate,
  });
  // Close the loop: turn a due meter straight into a work order.
  const [raisingId, setRaisingId] = useState<string | null>(null);
  const [raisedIds, setRaisedIds] = useState<Set<string>>(new Set());
  const raiseWO = useMutation({
    mutationFn: (mt: Meter) => api("/jobs", { method: "POST", body: JSON.stringify({
      title: `Service due: ${mt.name}${mt.assetName ? ` — ${mt.assetName}` : ""}`,
      assetId: mt.assetId, priority: "routine",
      description: `Predictive maintenance: meter "${mt.name}" has reached its service point at ${fmt(mt.currentValue)}${mt.unit ? " " + mt.unit : ""}.`,
    }) }),
    onMutate: (mt: Meter) => setRaisingId(mt.id),
    onSuccess: (_d, mt) => { setRaisedIds((s) => new Set(s).add(mt.id)); setRaisingId(null); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: () => setRaisingId(null),
  });

  if (metersQ.isLoading) return <div className="p-8 text-slate-500">Loading meters…</div>;
  if (metersQ.error) return <div className="p-8 text-red-600">Could not load meters.</div>;

  const meters = [...(metersQ.data?.meters ?? [])].sort((a, b) => RANK[a.status] - RANK[b.status] || a.assetName?.localeCompare(b.assetName ?? "") || 0);
  const dueCount = meters.filter((m) => m.status === "due").length;
  const soonCount = meters.filter((m) => m.status === "due_soon").length;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Meters</h1>
          <p className="text-sm text-slate-500 mt-1">Usage-based (predictive) maintenance. Log readings; HazardLink flags each asset when it's due by actual use.</p>
        </div>
        <button onClick={() => setAdding(true)} disabled={assets.length === 0} className="btn-primary whitespace-nowrap">Add meter</button>
      </div>

      {(dueCount > 0 || soonCount > 0) && (
        <div className="flex gap-2 mb-5 text-sm">
          {dueCount > 0 && <span className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200">{dueCount} service{dueCount > 1 ? "s" : ""} due</span>}
          {soonCount > 0 && <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{soonCount} due soon</span>}
        </div>
      )}

      {meters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-900 font-medium">No meters yet.</p>
          <p className="text-sm text-slate-500 mt-1">{assets.length === 0 ? "Add an asset first, then put a usage meter on it." : "Add a meter to an asset (e.g. runtime hours on a boiler) and log readings."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {meters.map((m) => {
            const s = STATUS[m.status];
            return (
              <div key={m.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{m.assetName ?? "—"}</div>
                    <div className="text-sm text-slate-500">{m.name}</div>
                  </div>
                  <span className={s.badge + " shrink-0"}>{s.label}</span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="stat-value">{fmt(m.currentValue)}</span>
                  {m.unit && <span className="text-sm text-slate-500">{m.unit}</span>}
                </div>

                {m.intervalValue != null ? (
                  <>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={"h-full rounded-full " + s.bar} style={{ width: `${m.pct ?? 0}%` }} />
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500">
                      {m.remaining != null && m.remaining > 0
                        ? <>Next service at {fmt(m.nextServiceAt ?? 0)}{m.unit ? ` ${m.unit}` : ""} · {fmt(m.remaining)} to go</>
                        : <>Overdue by {fmt(Math.abs(m.remaining ?? 0))}{m.unit ? ` ${m.unit}` : ""}</>}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-slate-400">No service interval set — tracking only.</div>
                )}

                <div className="mt-3 flex gap-3 text-sm flex-wrap">
                  <button onClick={() => setReading(m)} className="text-blue-700 hover:underline">Log reading</button>
                  {(m.status === "due" || m.status === "due_soon") && (
                    raisedIds.has(m.id)
                      ? <span className="inline-flex items-center gap-1 text-emerald-600">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                          Work order raised
                        </span>
                      : <button onClick={() => raiseWO.mutate(m)} disabled={raisingId === m.id} className="text-blue-700 hover:underline disabled:text-slate-400">{raisingId === m.id ? "Raising…" : "Raise work order"}</button>
                  )}
                  <button
                    onClick={() => { if (window.confirm(`Mark "${m.name}" on ${m.assetName} as serviced now? The next-service threshold rolls forward from ${fmt(m.currentValue)}${m.unit ? " " + m.unit : ""}.`)) service.mutate(m.id); }}
                    className="text-slate-500 hover:text-slate-800 ml-auto"
                  >Mark serviced</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <MeterDialog assets={assets} onClose={() => setAdding(false)} onSaved={() => { invalidate(); setAdding(false); }} />}
      {reading && <ReadingDialog meter={reading} onClose={() => setReading(null)} onSaved={() => { invalidate(); setReading(null); }} />}
    </div>
  );
}

const inp = "input";

function MeterDialog({ assets, onClose, onSaved }: { assets: AssetLite[]; onClose: () => void; onSaved: () => void }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [interval, setInterval] = useState("");
  const [current, setCurrent] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () => api("/meters", {
      method: "POST",
      body: JSON.stringify({
        assetId, name: name.trim(),
        unit: unit.trim() || undefined,
        intervalValue: interval.trim() ? Number(interval) : null,
        currentValue: current.trim() ? Number(current) : undefined,
      }),
    }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the fields and try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Add meter</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Group label="Asset">
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={inp}>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Group>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group label="Meter name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} placeholder="e.g. Runtime hours" className={inp} /></Group>
            <Group label="Unit"><input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} placeholder="e.g. hrs, cycles, km" className={inp} /></Group>
            <Group label="Service every (interval)"><input type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} placeholder="e.g. 500" className={inp} /></Group>
            <Group label="Current reading"><input type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="e.g. 1200" className={inp} /></Group>
          </div>
          <p className="text-xs text-slate-500">Set an interval to get "service due" alerts; leave it blank to just track the value.</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => { setErr(null); save.mutate(); }} disabled={!assetId || !name.trim() || save.isPending} className="btn-primary">{save.isPending ? "Saving…" : "Add meter"}</button>
        </div>
      </div>
    </div>
  );
}

function ReadingDialog({ meter, onClose, onSaved }: { meter: Meter; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(meter.currentValue));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () => api(`/meters/${meter.id}/readings`, { method: "POST", body: JSON.stringify({ value: Number(value), note: note.trim() || undefined }) }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save the reading — try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-medium text-slate-900">Log reading</h2>
          <p className="text-sm text-slate-500 mt-0.5">{meter.assetName} · {meter.name}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Group label={`New reading${meter.unit ? ` (${meter.unit})` : ""}`}>
            <input type="number" min={0} value={value} autoFocus onChange={(e) => setValue(e.target.value)} className={inp} />
          </Group>
          <Group label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything to record" className={inp} />
          </Group>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => { setErr(null); save.mutate(); }} disabled={value.trim() === "" || save.isPending} className="btn-primary">{save.isPending ? "Saving…" : "Save reading"}</button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}
