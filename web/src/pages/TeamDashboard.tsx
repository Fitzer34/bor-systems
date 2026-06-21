import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  useSection,
  loadDefaultTeam,
  saveDefaultTeam,
  type Section,
  type Team,
} from "../lib/section";
import { AttentionQueue } from "../components/AttentionQueue";
import { CleaningColumn } from "../components/team/CleaningColumn";
import { MaintenanceColumn } from "../components/team/MaintenanceColumn";
import { SecurityColumn } from "../components/team/SecurityColumn";

/* ─── TeamDashboard ───────────────────────────────────────────────────────────
 *
 * The unified home for staff. A team switcher (All / Cleaning / Maintenance /
 * Security) drives a tailored greeting, a row of discipline KPI tiles, the
 * cross-discipline "Needs your attention" queue, and a team-specific right
 * column. The chosen team is bound to the sidebar section (so switching here
 * flips the sidebar too) and can be saved as the user's default.
 *
 * Everything is computed client-side from existing list endpoints — no new
 * backend. Staff-only queries are gated so a non-staff viewer never 403s.
 */

interface ActiveAlert { id: string; status: "open" | "acknowledged" | "closed"; kind: "spill" | "planned_cleaning" }
interface Job { id: string; status: string; priority?: string }
interface Ppm { id: string; nextDueDate: string; active: boolean }
interface Part { id: string; stockQty: number; reorderLevel: number }
interface UserRow { id: string; role: "admin" | "supervisor" | "cleaner"; onDuty: boolean; deactivatedAt: string | null }
interface MonSession { id: string; status: "active" | "ended" | "alarm"; nextCheckInDueAt: string | null }

const DONE = new Set(["completed", "cancelled"]);

function daysUntil(iso: string): number {
  const due = Date.parse(iso + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((due - today) / 86_400_000);
}

const TEAMS: { key: Team; label: string }[] = [
  { key: "all", label: "All teams" },
  { key: "cleaning", label: "Cleaning" },
  { key: "maintenance", label: "Maintenance" },
  { key: "security", label: "Security" },
];

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0] || name;
  return `${part}, ${first}`;
}

export function TeamDashboard() {
  const { user } = useAuth();
  const { section, setSection } = useSection();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";

  // The active team. Initialise from the saved default if there is one,
  // otherwise from the current sidebar section (so the home reflects the side
  // they last picked), falling back to "all".
  const [team, setTeam] = useState<Team>(() => loadDefaultTeam() ?? section ?? "all");

  // On first load, if a saved default points at a real discipline, sync the
  // sidebar section to it so the two don't disagree.
  useEffect(() => {
    const saved = loadDefaultTeam();
    if (saved && saved !== "all" && saved !== section) setSection(saved as Section);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the saved default in React state so the button label flips the instant
  // it's set. (Reading localStorage during render wouldn't re-render on its own.)
  const [defaultTeam, setDefaultTeam] = useState<Team | null>(loadDefaultTeam);
  const isDefault = defaultTeam === team;

  const pickTeam = (t: Team) => {
    setTeam(t);
    if (t !== "all") setSection(t as Section);
  };
  const makeDefault = () => {
    saveDefaultTeam(team);
    setDefaultTeam(team);
  };

  const wants = (t: Section) => team === "all" || team === t;

  // ── KPI source data (gated to staff + scope) ──
  const alertsQ = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    enabled: isStaff && wants("cleaning"),
    refetchInterval: 15_000,
  });
  const jobsQ = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<{ jobs: Job[] }>("/jobs"),
    enabled: isStaff && wants("maintenance"),
    refetchInterval: 60_000,
  });
  const ppmsQ = useQuery({
    queryKey: ["ppms"],
    queryFn: () => api<{ ppms: Ppm[] }>("/ppms"),
    enabled: isStaff && wants("maintenance"),
    refetchInterval: 60_000,
  });
  const partsQ = useQuery({
    queryKey: ["parts"],
    queryFn: () => api<{ parts: Part[] }>("/parts"),
    enabled: isStaff && wants("maintenance"),
  });
  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[] }>("/users"),
    enabled: isStaff && (wants("cleaning") || wants("security")),
    refetchInterval: 30_000,
  });
  const sessionsQ = useQuery({
    queryKey: ["lone-worker-sessions"],
    queryFn: () => api<{ sessions: MonSession[] }>("/lone-worker/sessions"),
    enabled: isStaff && wants("security"),
    refetchInterval: 15_000,
  });

  const kpis = useMemo<KpiTile[]>(() => {
    const tiles: KpiTile[] = [];
    const now = Date.now();

    if (wants("cleaning")) {
      const spills = (alertsQ.data?.alerts ?? []).filter((a) => a.kind === "spill" && a.status !== "closed");
      const openSpills = spills.filter((a) => a.status === "open");
      const cleaners = (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt && u.onDuty && u.role === "cleaner");
      tiles.push({ to: "/", label: "Active spills", value: spills.length, sub: openSpills.length ? `${openSpills.length} unacknowledged` : "all acknowledged", tone: openSpills.length ? "red" : spills.length ? "amber" : "default" });
      tiles.push({ to: "/users", label: "Cleaners on shift", value: cleaners.length, sub: "on duty now", tone: "default" });
    }

    if (wants("maintenance")) {
      const jobs = jobsQ.data?.jobs ?? [];
      const open = jobs.filter((j) => !DONE.has(j.status));
      const emergency = open.filter((j) => j.priority === "emergency");
      const ppms = (ppmsQ.data?.ppms ?? []).filter((p) => p.active);
      const overdue = ppms.filter((p) => daysUntil(p.nextDueDate) < 0);
      const compliance = ppms.length ? Math.round(((ppms.length - overdue.length) / ppms.length) * 100) : 100;
      const lowParts = (partsQ.data?.parts ?? []).filter((p) => p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel));
      tiles.push({ to: "/maintenance", label: "Open work orders", value: open.length, sub: emergency.length ? `${emergency.length} emergency` : "none urgent", tone: emergency.length ? "red" : "default" });
      tiles.push({ to: "/ppms", label: "PPM compliance", value: `${compliance}%`, sub: `${overdue.length} overdue`, tone: overdue.length ? "amber" : "emerald" });
      tiles.push({ to: "/parts", label: "Low-stock parts", value: lowParts.length, sub: "at/below reorder", tone: lowParts.length ? "red" : "default" });
    }

    if (wants("security")) {
      const sessions = sessionsQ.data?.sessions ?? [];
      const active = sessions.filter((s) => s.status === "active");
      const alarms = sessions.filter((s) => s.status === "alarm");
      const overdue = active.filter((s) => s.nextCheckInDueAt && new Date(s.nextCheckInDueAt).getTime() <= now);
      const guards = (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt && u.onDuty);
      tiles.push({ to: "/lone-worker", label: "Lone-worker sessions", value: active.length, sub: alarms.length ? `${alarms.length} in alarm` : overdue.length ? `${overdue.length} overdue` : "all current", tone: alarms.length ? "red" : overdue.length ? "amber" : "default" });
      tiles.push({ to: "/users", label: "Guards on duty", value: guards.length, sub: "on duty now", tone: "default" });
    }

    return tiles;
  }, [team, alertsQ.data, jobsQ.data, ppmsQ.data, partsQ.data, usersQ.data, sessionsQ.data]);

  if (!user) return null;

  return (
    <div>
      {/* Greeting + team switcher */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{greeting(user.name)}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {team === "all" ? "Here's everything across your teams." : `Your ${TEAMS.find((t) => t.key === team)?.label.toLowerCase()} view.`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            {TEAMS.map((t) => (
              <button
                key={t.key}
                onClick={() => pickTeam(t.key)}
                className={
                  "px-3 py-1 rounded-md font-medium transition " +
                  (team === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={makeDefault}
            disabled={isDefault}
            className="text-xs text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
          >
            {isDefault ? "This is your default view" : "Make this my default"}
          </button>
        </div>
      </div>

      {!isStaff ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Team dashboards are for admins and supervisors.
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {kpis.map((k) => <Kpi key={k.label} {...k} />)}
            </div>
          )}

          {/* Attention queue + team column */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <AttentionQueue team={team} />
            </div>
            <div>
              {team === "all" ? (
                <div className="space-y-5">
                  <MaintenanceColumn />
                  <SecurityColumn />
                </div>
              ) : team === "cleaning" ? (
                <CleaningColumn />
              ) : team === "maintenance" ? (
                <MaintenanceColumn />
              ) : (
                <SecurityColumn />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface KpiTile {
  to: string;
  label: string;
  value: number | string;
  sub: string;
  tone: "default" | "red" | "amber" | "emerald";
}

function Kpi({ to, label, value, sub, tone }: KpiTile) {
  const valueCls =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "";
  return (
    <Link to={to} className="card card-hover">
      <div className="stat-label">{label}</div>
      <div className={"stat-value mt-1 " + valueCls}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </Link>
  );
}

export default TeamDashboard;
