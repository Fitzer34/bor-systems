import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../lib/api";

/**
 * Asset register — the backbone of the CMMS. Every piece of plant/equipment a
 * site maintains (boilers, lifts, AC units, extinguishers…) as a record with
 * location, trade, make/model/serial, install date, warranty, condition and
 * cost. PPMs and maintenance jobs reference these assets.
 */

interface Asset {
  id: string;
  name: string;
  category: string | null;
  tradeId: string | null;
  buildingId: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  installDate: string | null;
  expectedLifeYears: number | null;
  warrantyExpiry: string | null;
  conditionScore: number | null;
  purchaseCostCents: number | null;
  replacementCostCents: number | null;
  notes: string | null;
  reportToken: string | null;
  retired: boolean;
}
interface Building { id: string; name: string }
interface Trade { id: string; name: string; groupName: string | null }

const CONDITION = ["—", "Poor", "Fair", "OK", "Good", "Excellent"];

function euro(cents: number | null): string {
  if (cents == null) return "—";
  return "€" + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function warranty(iso: string | null): { label: string; cls: string } | null {
  if (!iso) return null;
  const due = Date.parse(iso + "T00:00:00");
  const days = Math.round((due - Date.now()) / 86_400_000);
  if (days < 0) return { label: "Warranty expired", cls: "bg-red-100 text-red-700" };
  if (days <= 90) return { label: `Warranty ends ${fmtDate(iso)}`, cls: "bg-amber-100 text-amber-700" };
  return { label: `In warranty to ${fmtDate(iso)}`, cls: "bg-emerald-100 text-emerald-700" };
}
function conditionCls(n: number | null): string {
  if (n == null) return "bg-slate-200 text-slate-600";
  if (n <= 2) return "bg-red-100 text-red-700";
  if (n === 3) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function useAiConfigured(): boolean {
  const { data } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api<{ configured: boolean }>("/ai/status"),
    staleTime: 5 * 60_000,
  });
  return !!data?.configured;
}

export function Assets() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["assets"], queryFn: () => api<{ assets: Asset[] }>("/assets") });
  const buildingsQ = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const tradesQ = useQuery({ queryKey: ["trades"], queryFn: () => api<{ trades: Trade[] }>("/trades") });
  const buildings = buildingsQ.data?.buildings ?? [];
  const trades = tradesQ.data?.trades ?? [];
  const bName = (id: string | null) => buildings.find((b) => b.id === id)?.name ?? null;
  const tName = (id: string | null) => trades.find((t) => t.id === id)?.name ?? null;

  const [editing, setEditing] = useState<Asset | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const all = data?.assets ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((a) =>
      [a.name, a.category, a.make, a.model, a.serial].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [data, q]);

  if (isLoading) return <div className="p-8 text-slate-500">Loading assets…</div>;
  if (error) return <div className="p-8 text-red-600">Could not load assets.</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Asset register</h1>
          <p className="text-sm text-slate-500 mt-1">Everything you maintain — with location, warranty, condition and cost. PPMs and jobs link to these.</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap">+ Add asset</button>
      </div>

      <input
        value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, make, model, serial…"
        className="w-full max-w-md mb-5 px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 text-sm"
      />

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-800">{q ? "No assets match your search." : "No assets yet."}</p>
          {!q && <p className="text-sm text-slate-500 mt-2">Add your plant + equipment (boilers, lifts, AC units, extinguishers…) to build the register.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const w = warranty(a.warrantyExpiry);
            return (
              <div key={a.id} className="rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition p-4 flex gap-4">
                <button onClick={() => setEditing(a)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <h3 className="font-medium text-slate-900">{a.name}</h3>
                    {a.conditionScore != null && <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + conditionCls(a.conditionScore)}>{CONDITION[a.conditionScore]}</span>}
                    {w && <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + w.cls}>{w.label}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                    {a.category && <Field label="Category" value={a.category} />}
                    {bName(a.buildingId) && <Field label="Site" value={bName(a.buildingId)!} />}
                    {tName(a.tradeId) && <Field label="Trade" value={tName(a.tradeId)!} />}
                    {(a.make || a.model) && <Field label="Make/model" value={[a.make, a.model].filter(Boolean).join(" ")} />}
                    {a.serial && <Field label="Serial" value={a.serial} />}
                    {a.installDate && <Field label="Installed" value={fmtDate(a.installDate)} />}
                    {a.replacementCostCents != null && <Field label="Replacement" value={euro(a.replacementCostCents)} />}
                  </div>
                </button>
                {a.reportToken && <ReportQR token={a.reportToken} />}
              </div>
            );
          })}
        </div>
      )}

      {(editing || creating) && (
        <AssetDialog
          asset={editing} buildings={buildings} trades={trades}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["assets"] }); setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <span><span className="text-slate-500">{label}:</span> <span className="text-slate-900">{value}</span></span>;
}

// Printable "report a fault" QR for an asset — stick it on the kit; anyone can
// scan to raise a maintenance job (no login). The cross-discipline entry point.
function ReportQR({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/report/${token}`;
  return (
    <div className="shrink-0 text-center">
      <div className="bg-white p-1 border border-slate-200 rounded inline-block"><QRCodeSVG value={url} size={64} /></div>
      <button
        onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        className="block w-full text-[11px] text-blue-700 hover:underline mt-1"
        title="Print this and put it on the asset — anyone can scan to report a fault"
      >{copied ? "Copied!" : "Report QR"}</button>
    </div>
  );
}

function AssetDialog({ asset, buildings, trades, onClose, onSaved }: {
  asset: Asset | null; buildings: Building[]; trades: Trade[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!asset;
  const [name, setName] = useState(asset?.name ?? "");
  const [category, setCategory] = useState(asset?.category ?? "");
  const [buildingId, setBuildingId] = useState(asset?.buildingId ?? "");
  const [tradeId, setTradeId] = useState(asset?.tradeId ?? "");
  const [make, setMake] = useState(asset?.make ?? "");
  const [model, setModel] = useState(asset?.model ?? "");
  const [serial, setSerial] = useState(asset?.serial ?? "");
  const [installDate, setInstallDate] = useState(asset?.installDate ?? "");
  const [expectedLifeYears, setExpectedLifeYears] = useState(asset?.expectedLifeYears != null ? String(asset.expectedLifeYears) : "");
  const [warrantyExpiry, setWarrantyExpiry] = useState(asset?.warrantyExpiry ?? "");
  const [conditionScore, setConditionScore] = useState(asset?.conditionScore != null ? String(asset.conditionScore) : "");
  const [purchase, setPurchase] = useState(asset?.purchaseCostCents != null ? String(asset.purchaseCostCents / 100) : "");
  const [replacement, setReplacement] = useState(asset?.replacementCostCents != null ? String(asset.replacementCostCents / 100) : "");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function body() {
    const eur = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));
    const int = (s: string) => (s.trim() === "" ? null : Number(s));
    return {
      name: name.trim(),
      category: category.trim() || undefined,
      buildingId: buildingId || null,
      tradeId: tradeId || null,
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      serial: serial.trim() || undefined,
      installDate: installDate || undefined,
      expectedLifeYears: int(expectedLifeYears) ?? undefined,
      warrantyExpiry: warrantyExpiry || undefined,
      conditionScore: conditionScore ? Number(conditionScore) : null,
      purchaseCostCents: eur(purchase),
      replacementCostCents: eur(replacement),
      notes: notes.trim() || undefined,
    };
  }

  const save = useMutation({
    mutationFn: () => isEdit
      ? api(`/assets/${asset!.id}`, { method: "PATCH", body: JSON.stringify(body()) })
      : api("/assets", { method: "POST", body: JSON.stringify(body()) }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the fields and try again."),
  });
  const retire = useMutation({
    mutationFn: () => api(`/assets/${asset!.id}`, { method: "PATCH", body: JSON.stringify({ retired: true }) }),
    onSuccess: onSaved,
  });
  const aiConfigured = useAiConfigured();
  const [summary, setSummary] = useState<string | null>(null);
  const summarise = useMutation({
    mutationFn: () => api<{ summary: string }>(`/ai/assets/${asset!.id}/summary`, { method: "POST" }),
    onSuccess: (r) => setSummary(r.summary),
    onError: () => setErr("Couldn't summarise — try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{isEdit ? "Edit asset" : "Add asset"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <Group label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={160} placeholder="e.g. Boiler #1 — Plant room" className={inp} />
          </Group>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Heating" className={inp} /></Group>
            <Group label="Trade">
              <select value={tradeId} onChange={(e) => setTradeId(e.target.value)} className={inp}>
                <option value="">— None —</option>
                {trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Group>
            <Group label="Building / site">
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={inp}>
                <option value="">— None —</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Group>
            <Group label="Condition">
              <select value={conditionScore} onChange={(e) => setConditionScore(e.target.value)} className={inp}>
                <option value="">— Not set —</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {CONDITION[n]}</option>)}
              </select>
            </Group>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Group label="Make"><input value={make} onChange={(e) => setMake(e.target.value)} className={inp} /></Group>
            <Group label="Model"><input value={model} onChange={(e) => setModel(e.target.value)} className={inp} /></Group>
            <Group label="Serial no."><input value={serial} onChange={(e) => setSerial(e.target.value)} className={inp} /></Group>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Group label="Install date"><input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} className={inp} /></Group>
            <Group label="Warranty expiry"><input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className={inp} /></Group>
            <Group label="Expected life (yrs)"><input type="number" min={0} max={100} value={expectedLifeYears} onChange={(e) => setExpectedLifeYears(e.target.value)} className={inp} /></Group>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group label="Purchase cost (€)"><input type="number" min={0} value={purchase} onChange={(e) => setPurchase(e.target.value)} className={inp} /></Group>
            <Group label="Replacement cost (€)"><input type="number" min={0} value={replacement} onChange={(e) => setReplacement(e.target.value)} className={inp} /></Group>
          </div>
          <Group label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className={inp + " resize-none"} />
          </Group>
          {isEdit && aiConfigured && (
            <div className="border-t border-slate-200 pt-4">
              {!summary ? (
                <button
                  type="button"
                  onClick={() => { setErr(null); summarise.mutate(); }}
                  disabled={summarise.isPending}
                  className="text-sm text-indigo-700 hover:text-indigo-900 font-medium disabled:text-slate-400"
                >
                  {summarise.isPending ? "Summarising…" : "✨ Summarise this asset's history"}
                </button>
              ) : (
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-sm">
                  <div className="font-medium text-indigo-900 mb-1">✨ History summary</div>
                  <p className="text-slate-700 whitespace-pre-wrap">{summary}</p>
                </div>
              )}
            </div>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          {isEdit
            ? <button onClick={() => retire.mutate()} disabled={retire.isPending} className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded">{retire.isPending ? "…" : "Retire asset"}</button>
            : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
            <button onClick={() => { setErr(null); save.mutate(); }} disabled={!name.trim() || save.isPending} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium">
              {save.isPending ? "Saving…" : isEdit ? "Save" : "Add asset"}
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
