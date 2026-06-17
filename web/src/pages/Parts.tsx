import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * CMMS inventory — spare-parts catalogue + stock. Track stock levels, set a
 * reorder level, and get a low-stock flag. Quick +/- adjust on each row.
 */

interface Part {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  unitCostCents: number | null;
  supplier: string | null;
  notes: string | null;
}

const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const isLow = (p: Part) => p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel);

export function Parts() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["parts"], queryFn: () => api<{ parts: Part[] }>("/parts") });
  const [editing, setEditing] = useState<Part | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <div className="p-8 text-slate-500">Loading parts…</div>;
  if (error) return <div className="p-8 text-red-600">Could not load parts.</div>;

  const list = data?.parts ?? [];
  const lowCount = list.filter(isLow).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["parts"] });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Parts &amp; inventory</h1>
          <p className="text-sm text-slate-500 mt-1">
            Spare-parts stock with reorder levels.{lowCount > 0 && <span className="text-red-700 font-medium"> {lowCount} low on stock.</span>}
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap">+ Add part</button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-800">No parts yet.</p>
          <p className="text-sm text-slate-500 mt-2">Add the spares you keep (filters, belts, fuses…) with a reorder level and we'll flag when stock runs low.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {list.map((p) => <PartRow key={p.id} part={p} onEdit={() => setEditing(p)} onChanged={refresh} />)}
        </div>
      )}

      {(editing || creating) && (
        <PartDialog
          part={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { refresh(); setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function PartRow({ part, onEdit, onChanged }: { part: Part; onEdit: () => void; onChanged: () => void }) {
  const adjust = useMutation({
    mutationFn: (delta: number) => api(`/parts/${part.id}`, { method: "PATCH", body: JSON.stringify({ stockQty: Math.max(0, part.stockQty + delta) }) }),
    onSuccess: onChanged,
  });
  const low = isLow(part);
  return (
    <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900">{part.name}</span>
          {part.sku && <span className="text-xs text-slate-400">{part.sku}</span>}
          {low && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Low stock</span>}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {part.supplier ? `${part.supplier} · ` : ""}reorder at {part.reorderLevel} · {euro(part.unitCostCents)}/{part.unit}
        </div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => adjust.mutate(-1)} disabled={adjust.isPending || part.stockQty <= 0} className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700">−</button>
        <span className={"w-14 text-center font-semibold tabular-nums " + (low ? "text-red-700" : "text-slate-900")}>{part.stockQty} <span className="text-xs font-normal text-slate-400">{part.unit}</span></span>
        <button onClick={() => adjust.mutate(1)} disabled={adjust.isPending} className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-700">+</button>
      </div>
    </div>
  );
}

function PartDialog({ part, onClose, onSaved }: { part: Part | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!part;
  const [name, setName] = useState(part?.name ?? "");
  const [sku, setSku] = useState(part?.sku ?? "");
  const [unit, setUnit] = useState(part?.unit ?? "each");
  const [stockQty, setStockQty] = useState(String(part?.stockQty ?? 0));
  const [reorderLevel, setReorderLevel] = useState(String(part?.reorderLevel ?? 0));
  const [unitCost, setUnitCost] = useState(part?.unitCostCents != null ? String(part.unitCostCents / 100) : "");
  const [supplier, setSupplier] = useState(part?.supplier ?? "");
  const [notes, setNotes] = useState(part?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = () => JSON.stringify({
    name: name.trim(),
    sku: sku.trim() || null,
    unit: unit.trim() || "each",
    stockQty: Number(stockQty) || 0,
    reorderLevel: Number(reorderLevel) || 0,
    unitCostCents: unitCost.trim() === "" ? null : Math.round(Number(unitCost) * 100),
    supplier: supplier.trim() || null,
    notes: notes.trim() || null,
  });

  const save = useMutation({
    mutationFn: () => isEdit
      ? api(`/parts/${part!.id}`, { method: "PATCH", body: body() })
      : api("/parts", { method: "POST", body: body() }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the fields and try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{isEdit ? "Edit part" : "Add part"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Group label="Part name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={160} placeholder="e.g. HEPA filter — AHU-3" className={inp} />
          </Group>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group label="SKU / part no."><input value={sku} onChange={(e) => setSku(e.target.value)} className={inp} /></Group>
            <Group label="Unit"><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="each / box / m" className={inp} /></Group>
            <Group label="In stock"><input type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} className={inp} /></Group>
            <Group label="Reorder at"><input type="number" min={0} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} className={inp} /></Group>
            <Group label="Unit cost (€)"><input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inp} /></Group>
            <Group label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inp} /></Group>
          </div>
          <Group label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className={inp + " resize-none"} /></Group>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={() => { setErr(null); save.mutate(); }} disabled={!name.trim() || save.isPending} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-500 rounded text-white font-medium">
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Add part"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-900 text-sm";

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-slate-500 mb-1">{label}</label>{children}</div>;
}
