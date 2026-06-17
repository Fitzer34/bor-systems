import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

/**
 * Maintenance KPIs — the "world-class maintenance" scorecard. Reliability
 * (MTTR / MTBF, bad actors), cost, PM compliance, backlog and repair-or-replace,
 * all computed server-side from data already captured (GET /maintenance/kpis).
 */

interface BadActor { assetId: string; name: string; criticality: string; reactiveJobs: number; spendCents: number }
interface ReplaceItem {
  assetId: string; name: string; criticality: string;
  ageYears: number | null; expectedLifeYears: number | null;
  spendCents: number; replacementCostCents: number | null; reasons: string[];
}
interface Kpis {
  pmCompliancePct: number | null; activePpms: number; overduePpms: number;
  mttrDays: number | null; mtbfDays: number | null;
  openBacklog: number; backlogOldestDays: number;
  completedThisMonth: number;
  plannedSharePct: number | null; planned90: number; reactive90: number;
  spend90Cents: number;
  byStatus: Record<string, number>;
  badActors: BadActor[];
  repairOrReplace: ReplaceItem[]; assetsPastLife: number;
}
interface Suggestion { title: string; area: string; observation: string; recommendation: string; impact: string }

const STATUS_LABEL: Record<string, string> = {
  logged: "Logged", scoped: "Scoped", tendering: "Tendering", awarded: "Awarded",
  scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  logged: "#94a3b8", scoped: "#64748b", tendering: "#2563eb", awarded: "#4f46e5",
  scheduled: "#6366f1", in_progress: "#f59e0b", completed: "#16a34a", cancelled: "#cbd5e1",
};
const CRIT_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
function critCls(c: string): string {
  if (c === "critical") return "bg-red-100 text-red-700";
  if (c === "high") return "bg-orange-100 text-orange-700";
  if (c === "low") return "bg-slate-100 text-slate-500";
  return "bg-blue-100 text-blue-700";
}
function euro(cents: number | null): string {
  if (cents == null) return "—";
  return "€" + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function MaintenanceKpis() {
  const { data: k, isLoading, error } = useQuery({ queryKey: ["maintenance-kpis"], queryFn: () => api<Kpis>("/maintenance/kpis") });
  const aiQ = useQuery({ queryKey: ["ai-status"], queryFn: () => api<{ configured: boolean }>("/ai/status"), staleTime: 5 * 60_000 });
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const improve = useMutation({
    mutationFn: () => api<{ suggestions: Suggestion[] }>("/ai/improvements", { method: "POST" }),
    onSuccess: (r) => setSuggestions(r.suggestions),
  });
  // Close the loop: turn a suggestion into a work order.
  const qc = useQueryClient();
  const [woPending, setWoPending] = useState<number | null>(null);
  const [woDone, setWoDone] = useState<Set<number>>(new Set());
  const raiseWO = useMutation({
    mutationFn: (v: { s: Suggestion; i: number }) => api("/jobs", { method: "POST", body: JSON.stringify({
      title: v.s.title.slice(0, 160), priority: "routine",
      description: `${v.s.observation}\n\nRecommended action: ${v.s.recommendation}\n\n(From AI continuous-improvement · area: ${v.s.area})`,
    }) }),
    onMutate: (v) => setWoPending(v.i),
    onSuccess: (_d, v) => { setWoDone((s) => new Set(s).add(v.i)); setWoPending(null); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: () => setWoPending(null),
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading KPIs…</div>;
  if (error || !k) return <div className="p-8 text-red-600">Could not load KPIs.</div>;

  const statusData = Object.entries(k.byStatus)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => ({ name: STATUS_LABEL[s] ?? s, value: n, color: STATUS_COLOR[s] ?? "#94a3b8" }));
  const pvr = [
    { name: "Planned", value: k.planned90, color: "#16a34a" },
    { name: "Reactive", value: k.reactive90, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Maintenance KPIs</h1>
        <p className="text-sm text-slate-500 mt-1">Reliability, cost and lifecycle — your world-class maintenance scorecard, from live data.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Stat label="PM compliance" value={k.pmCompliancePct == null ? "—" : `${k.pmCompliancePct}%`}
          sub={`${k.overduePpms} of ${k.activePpms} PPMs overdue`} tone={complianceTone(k.pmCompliancePct)} />
        <Stat label="MTTR" value={k.mttrDays == null ? "—" : `${k.mttrDays}d`} sub="avg to close a reactive job" />
        <Stat label="MTBF" value={k.mtbfDays == null ? "—" : `${k.mtbfDays}d`} sub="avg between failures / asset" />
        <Stat label="Open backlog" value={String(k.openBacklog)} sub={k.openBacklog ? `oldest ${k.backlogOldestDays}d` : "all clear"} />
        <Stat label="Completed (month)" value={String(k.completedThisMonth)} sub="work orders closed" />
        <Stat label="Planned share" value={k.plannedSharePct == null ? "—" : `${k.plannedSharePct}%`} sub="planned vs reactive (90d)" />
        <Stat label="Spend (90d)" value={euro(k.spend90Cents)} sub="awarded contractor cost" />
        <Stat label="Past expected life" value={String(k.assetsPastLife)} sub="assets to review" tone={k.assetsPastLife ? "text-amber-600" : "text-slate-900"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ChartCard title="Work orders by status">
          {statusData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>
                  {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Planned vs reactive (90 days)">
          {pvr.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pvr} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>
                  {pvr.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-2">Reliability — bad actors</h2>
      <p className="text-sm text-slate-500 mb-3">Assets generating the most reactive (unplanned) work. Tackle these to cut breakdowns.</p>
      {k.badActors.length === 0 ? (
        <p className="text-sm text-slate-500">No reactive work logged against assets yet.</p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Criticality</th>
                <th className="px-4 py-2.5 font-medium text-right">Reactive jobs</th>
                <th className="px-4 py-2.5 font-medium text-right">Spend</th>
              </tr>
            </thead>
            <tbody>
              {k.badActors.map((a) => (
                <tr key={a.assetId} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{a.name}</td>
                  <td className="px-4 py-2.5"><span className={"px-2 py-0.5 text-xs font-medium rounded-full " + critCls(a.criticality)}>{CRIT_LABEL[a.criticality] ?? a.criticality}</span></td>
                  <td className="px-4 py-2.5 text-right text-slate-900">{a.reactiveJobs}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{euro(a.spendCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-lg font-semibold mt-8 mb-2">Repair or replace</h2>
      <p className="text-sm text-slate-500 mb-3">Assets past their expected life or where repairs are approaching the cost of replacement.</p>
      {k.repairOrReplace.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing flagged — add install dates, expected life and replacement costs to your assets to power this.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {k.repairOrReplace.map((a) => (
            <div key={a.assetId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-medium text-slate-900">{a.name}</span>
                <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + critCls(a.criticality)}>{CRIT_LABEL[a.criticality] ?? a.criticality}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                {a.ageYears != null && <span>Age: <span className="text-slate-900">{a.ageYears} yr{a.expectedLifeYears != null ? ` / ${a.expectedLifeYears}` : ""}</span></span>}
                <span>Repairs: <span className="text-slate-900">{euro(a.spendCents)}</span></span>
                {a.replacementCostCents != null && <span>Replace: <span className="text-slate-900">{euro(a.replacementCostCents)}</span></span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.reasons.map((r) => <span key={r} className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">{r}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {aiQ.data?.configured && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div>
              <h2 className="text-lg font-semibold">Continuous improvement</h2>
              <p className="text-sm text-slate-500">AI reviews your reliability data and proposes preventive actions.</p>
            </div>
            <button onClick={() => improve.mutate()} disabled={improve.isPending} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500 rounded text-white font-medium whitespace-nowrap">
              {improve.isPending ? "Analysing…" : "✨ Suggest improvements"}
            </button>
          </div>
          {improve.isError && <p className="text-sm text-red-600">Couldn't generate suggestions — try again.</p>}
          {suggestions && suggestions.length === 0 && <p className="text-sm text-slate-500">Not enough maintenance history yet — come back once more jobs are logged.</p>}
          {suggestions && suggestions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-slate-900">{s.title}</span>
                    <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + impactCls(s.impact)}>{s.impact} impact</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">{s.area}</div>
                  <p className="text-sm text-slate-600"><span className="text-slate-500">Observation:</span> {s.observation}</p>
                  <p className="text-sm text-slate-800 mt-1"><span className="text-slate-500">Action:</span> {s.recommendation}</p>
                  <div className="mt-2.5">
                    {woDone.has(i)
                      ? <span className="text-sm text-emerald-600">✓ Work order created</span>
                      : <button onClick={() => raiseWO.mutate({ s, i })} disabled={woPending === i} className="text-sm text-blue-700 hover:underline disabled:text-slate-400">{woPending === i ? "Creating…" : "Create work order"}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function impactCls(i: string): string {
  if (i === "high") return "bg-red-100 text-red-700";
  if (i === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"text-2xl font-semibold mt-1 " + (tone ?? "text-slate-900")}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-700 mb-2">{title}</h3>
      {children}
    </div>
  );
}
function Empty() {
  return <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">No data yet</div>;
}
function complianceTone(pct: number | null): string {
  if (pct == null) return "text-slate-900";
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 70) return "text-amber-600";
  return "text-red-600";
}
