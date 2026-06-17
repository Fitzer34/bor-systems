import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

/**
 * Maintenance dashboard — the CMMS home. KPIs over everything already captured:
 * open work orders, PPM compliance, warranties expiring, low-stock parts, plus
 * focus lists for what needs attention. All computed client-side from the
 * existing endpoints (no extra backend).
 */

interface Job { id: string; title: string; status: string; priority?: string }
interface Ppm { id: string; title: string; nextDueDate: string; active: boolean; reminderLeadDays: number; contractorName: string | null }
interface Asset { id: string; name: string; warrantyExpiry: string | null }
interface Part { id: string; name: string; stockQty: number; reorderLevel: number }

const DONE = new Set(["completed", "cancelled"]);

function daysUntil(iso: string): number {
  const due = Date.parse(iso + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((due - today) / 86_400_000);
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function MaintenanceDashboard() {
  const jobsQ = useQuery({ queryKey: ["jobs"], queryFn: () => api<{ jobs: Job[] }>("/jobs"), refetchInterval: 60_000 });
  const ppmsQ = useQuery({ queryKey: ["ppms"], queryFn: () => api<{ ppms: Ppm[] }>("/ppms"), refetchInterval: 60_000 });
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: () => api<{ assets: Asset[] }>("/assets") });
  const partsQ = useQuery({ queryKey: ["parts"], queryFn: () => api<{ parts: Part[] }>("/parts") });

  const m = useMemo(() => {
    const jobs = jobsQ.data?.jobs ?? [];
    const ppms = (ppmsQ.data?.ppms ?? []).filter((p) => p.active);
    const assets = assetsQ.data?.assets ?? [];
    const parts = partsQ.data?.parts ?? [];

    const openJobs = jobs.filter((j) => !DONE.has(j.status));
    const emergencyOpen = openJobs.filter((j) => j.priority === "emergency");
    const overduePpms = ppms.filter((p) => daysUntil(p.nextDueDate) < 0).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
    const dueSoonPpms = ppms.filter((p) => { const d = daysUntil(p.nextDueDate); return d >= 0 && d <= p.reminderLeadDays; });
    const compliance = ppms.length ? Math.round(((ppms.length - overduePpms.length) / ppms.length) * 100) : 100;
    const warrantyExpiring = assets
      .filter((a) => a.warrantyExpiry && daysUntil(a.warrantyExpiry) >= 0 && daysUntil(a.warrantyExpiry) <= 90)
      .sort((a, b) => (a.warrantyExpiry ?? "").localeCompare(b.warrantyExpiry ?? ""));
    const lowParts = parts.filter((p) => p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel));

    return { openJobs, emergencyOpen, overduePpms, dueSoonPpms, compliance, warrantyExpiring, lowParts, ppmCount: ppms.length };
  }, [jobsQ.data, ppmsQ.data, assetsQ.data, partsQ.data]);

  const loading = jobsQ.isLoading || ppmsQ.isLoading || assetsQ.isLoading || partsQ.isLoading;

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">Maintenance dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">Live overview of work, planned maintenance, assets and stock.</p>

      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi to="/maintenance" label="Open work orders" value={m.openJobs.length} sub={m.emergencyOpen.length ? `${m.emergencyOpen.length} emergency` : "none urgent"} tone={m.emergencyOpen.length ? "red" : "default"} />
            <Kpi to="/ppms" label="PPM compliance" value={`${m.compliance}%`} sub={`${m.overduePpms.length} overdue · ${m.dueSoonPpms.length} due soon`} tone={m.overduePpms.length ? "amber" : "emerald"} />
            <Kpi to="/assets" label="Warranties expiring" value={m.warrantyExpiring.length} sub="next 90 days" tone={m.warrantyExpiring.length ? "amber" : "default"} />
            <Kpi to="/parts" label="Low-stock parts" value={m.lowParts.length} sub="at/below reorder" tone={m.lowParts.length ? "red" : "default"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
            <Panel title={`Overdue PPMs (${m.overduePpms.length})`} to="/ppms">
              {m.overduePpms.length === 0 ? <Empty>Nothing overdue 🎉</Empty> : m.overduePpms.slice(0, 6).map((p) => (
                <Row key={p.id} main={p.title} sub={p.contractorName ?? "No contractor"} tag={`${-daysUntil(p.nextDueDate)}d over`} tone="red" />
              ))}
            </Panel>
            <Panel title={`Warranties expiring (${m.warrantyExpiring.length})`} to="/assets">
              {m.warrantyExpiring.length === 0 ? <Empty>None in the next 90 days</Empty> : m.warrantyExpiring.slice(0, 6).map((a) => (
                <Row key={a.id} main={a.name} sub="warranty" tag={fmtDate(a.warrantyExpiry!)} tone="amber" />
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ to, label, value, sub, tone }: { to: string; label: string; value: number | string; sub: string; tone: "default" | "red" | "amber" | "emerald" }) {
  const valueCls = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <Link to={to} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"text-3xl font-semibold mt-1 " + valueCls}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </Link>
  );
}

function Panel({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <Link to={to} className="text-xs text-blue-700 hover:underline">View all →</Link>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ main, sub, tag, tone }: { main: string; sub: string; tag: string; tone: "red" | "amber" }) {
  const tagCls = tone === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="text-slate-900 truncate">{main}</div>
        <div className="text-xs text-slate-500 truncate">{sub}</div>
      </div>
      <span className={"px-2 py-0.5 text-xs font-medium rounded-full shrink-0 " + tagCls}>{tag}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
