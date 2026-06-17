import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, apiUrl, getToken } from "../lib/api";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";

/**
 * Maintenance dashboard — the CMMS home. KPIs over everything already captured:
 * open work orders, PPM compliance, warranties expiring, low-stock parts, plus
 * focus lists for what needs attention. All computed client-side from the
 * existing endpoints (no extra backend).
 */

interface Job { id: string; title: string; status: string; priority?: string; createdAt?: string }
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

const STATUS_LABEL: Record<string, string> = {
  logged: "Logged", scoped: "Scoped", tendering: "Tendering", awarded: "Awarded",
  scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  logged: "#94a3b8", scoped: "#94a3b8", tendering: "#2563eb", awarded: "#4f46e5",
  scheduled: "#4f46e5", in_progress: "#f59e0b", completed: "#16a34a", cancelled: "#94a3b8",
};

/** Rolling 7-day buckets, oldest→newest, ending today (for the trend chart). */
function lastNWeeks(n: number): { start: number; end: number; label: string }[] {
  const dayMs = 86_400_000;
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + dayMs;
  const out: { start: number; end: number; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = todayEnd - i * 7 * dayMs;
    const start = end - 7 * dayMs;
    out.push({ start, end, label: new Date(start).toLocaleDateString(undefined, { day: "numeric", month: "short" }) });
  }
  return out;
}

/**
 * Download a server-generated CSV from one of the maintenance export endpoints
 * (/jobs.csv, /ppms.csv, /parts.csv, /assets.csv). The backend builds the CSV
 * so the web, iOS and Android all export identical files. We fetch with the
 * auth header (an `<a download>` can't set headers) and save the blob.
 */
async function downloadCsv(path: string, base: string): Promise<void> {
  const res = await fetch(apiUrl(path), { headers: { authorization: `Bearer ${getToken() ?? ""}` } });
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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

    // Open work orders grouped by status (donut). Only statuses with ≥1 open job.
    const statusOrder = ["logged", "scoped", "tendering", "awarded", "scheduled", "in_progress"];
    const byStatus = statusOrder
      .map((s) => ({ key: s, label: STATUS_LABEL[s] ?? s, value: openJobs.filter((j) => j.status === s).length, color: STATUS_COLOR[s] ?? "#94a3b8" }))
      .filter((d) => d.value > 0);

    // Jobs logged per week for the last 12 weeks (trend area chart).
    const weekly = lastNWeeks(12).map(({ start, end, label }) => ({
      week: label,
      count: jobs.filter((j) => { const t = j.createdAt ? Date.parse(j.createdAt) : NaN; return t >= start && t < end; }).length,
    }));

    return { openJobs, emergencyOpen, overduePpms, dueSoonPpms, compliance, warrantyExpiring, lowParts, ppmCount: ppms.length, byStatus, weekly };
  }, [jobsQ.data, ppmsQ.data, assetsQ.data, partsQ.data]);

  const loading = jobsQ.isLoading || ppmsQ.isLoading || assetsQ.isLoading || partsQ.isLoading;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Maintenance dashboard</h1>
          <p className="text-sm text-slate-500">Live overview of work, planned maintenance, assets and stock.</p>
        </div>
        <ExportMenu disabled={loading} />
      </div>

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
            <ChartCard title="Work orders logged — last 12 weeks">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={m.weekly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="jobsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Area type="monotone" dataKey="count" name="Jobs" stroke="#2563eb" strokeWidth={2} fill="url(#jobsGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Open work orders by status">
              {m.byStatus.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-slate-500">No open work orders 🎉</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={188}>
                    <PieChart>
                      <Pie data={m.byStatus} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={2}>
                        {m.byStatus.map((d) => <Cell key={d.key} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
                    {m.byStatus.map((d) => (
                      <span key={d.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /> {d.label} ({d.value})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>
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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      {children}
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

const EXPORTS: { path: string; base: string; label: string }[] = [
  { path: "/jobs.csv", base: "work-orders", label: "Work orders" },
  { path: "/ppms.csv", base: "ppms", label: "Planned maintenance (PPMs)" },
  { path: "/assets.csv", base: "assets", label: "Assets & warranties" },
  { path: "/parts.csv", base: "parts", label: "Parts & inventory" },
];

/** Header "Export CSV ▾" menu — one row per dataset, each a server-side CSV. */
function ExportMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — the behaviour a native <details> lacks.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (path: string, base: string) => {
    setBusy(path);
    setError(false);
    try {
      await downloadCsv(path, base);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded px-3 py-1.5 text-sm"
      >
        Export CSV ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-60 rounded-lg border border-slate-200 bg-white shadow-lg z-10 p-1">
          {EXPORTS.map((e) => (
            <button
              key={e.path}
              role="menuitem"
              onClick={() => run(e.path, e.base)}
              disabled={busy !== null}
              className="w-full text-left text-sm px-3 py-1.5 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === e.path ? `Exporting ${e.label}…` : e.label}
            </button>
          ))}
          {error && <p className="text-xs text-red-600 px-3 py-1.5">Export failed — please try again.</p>}
        </div>
      )}
    </div>
  );
}
