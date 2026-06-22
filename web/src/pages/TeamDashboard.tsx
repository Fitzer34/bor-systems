import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";
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
import { Icons, StatCard, type StatCardProps } from "../components/dashboard/primitives";
import { SpillsBanner, type SpillCardData } from "../components/dashboard/SpillsBanner";
import { LiveFeed, type FeedRowData } from "../components/dashboard/LiveFeed";
import { DisciplineCard, SitesCard, type SiteRow } from "../components/dashboard/SummaryCards";
import { HeroBanner } from "../components/dashboard/HeroBanner";

/* ─── TeamDashboard ───────────────────────────────────────────────────────────
 *
 * The unified home for staff, rebuilt to the design prototype. A team switcher
 * (All / Cleaning / Maintenance / Security) drives the whole page:
 *
 *   • "All teams" — a cross-discipline command centre: greeting + "New work
 *     order", an Active-spills banner with live spill cards, a row of five KPI
 *     cards, then a two-column grid (a unified live operations feed on the left;
 *     discipline summary cards + a Sites rollup on the right).
 *   • A discipline ("Cleaning" / "Maintenance" / "Security") — a tailored
 *     greeting, a discipline hero banner, discipline KPI tiles, the existing
 *     "Needs your attention" action queue, and the team's right column.
 *
 * Everything is derived client-side from the same list endpoints the rest of the
 * app uses — no new backend. Staff-only queries are gated so a non-staff viewer
 * never 403s; each is also scoped to the active team so a narrowed view doesn't
 * fetch the other disciplines needlessly.
 */

interface ActiveAlert {
  id: string;
  hangerId: string;
  status: "open" | "acknowledged" | "closed";
  kind: "spill" | "planned_cleaning";
  openedAt: string;
  zoneName: string | null;
  floorName: string | null;
}
interface Hanger { id: string; name: string | null; buildingId: string | null }
interface Building { id: string; name: string; address: string | null }
interface Job { id: string; title: string; status: string; priority?: string; buildingId: string | null; createdAt?: string }
interface Ppm { id: string; title: string; nextDueDate: string; active: boolean }
interface Part { id: string; name: string; stockQty: number; reorderLevel: number }
interface UserRow { id: string; name: string; role: "admin" | "supervisor" | "cleaner"; onDuty: boolean; deactivatedAt: string | null }
interface MonSession { id: string; status: "active" | "ended" | "alarm"; userName: string | null; nextCheckInDueAt: string | null }
interface SiteSummary { buildingId: string; buildingName: string; openAlerts: number }
interface Dispatch { id: string; status: "sent" | "acknowledged" | "completed"; zoneName: string | null }

const DONE = new Set(["completed", "cancelled"]);

function daysUntil(iso: string): number {
  const due = Date.parse(iso + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((due - today) / 86_400_000);
}
function minsAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}
function shortAgo(iso?: string): string {
  if (!iso) return "";
  const m = minsAgo(iso);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const TEAMS: { key: Team; label: string }[] = [
  { key: "all", label: "All teams" },
  { key: "cleaning", label: "Cleaning" },
  { key: "maintenance", label: "Maintenance" },
  { key: "security", label: "Security" },
];

function dayName(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long" });
}
function timeOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
function greetingPrefix(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function TeamDashboard() {
  const { user } = useAuth();
  const { section, setSection } = useSection();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  // Keep relative times + escalation chips fresh between refetches.
  useTicker(1000);

  const [team, setTeam] = useState<Team>(() => loadDefaultTeam() ?? section ?? "all");

  useEffect(() => {
    const saved = loadDefaultTeam();
    if (saved && saved !== "all" && saved !== section) setSection(saved as Section);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Data (gated to staff + scope) ──
  const alertsQ = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    enabled: isStaff && wants("cleaning"),
    refetchInterval: 15_000,
  });
  const hangersQ = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    enabled: isStaff && wants("cleaning"),
    refetchInterval: 60_000,
  });
  const buildingsQ = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
    enabled: isStaff,
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
  const sitesQ = useQuery({
    queryKey: ["sites-summary"],
    queryFn: () => api<{ sites: SiteSummary[] }>("/sites/summary"),
    enabled: isStaff,
    refetchInterval: 30_000,
  });
  const dispatchesQ = useQuery({
    queryKey: ["dispatches"],
    queryFn: () => api<{ dispatches: Dispatch[] }>("/dispatches"),
    enabled: isStaff && wants("cleaning"),
    refetchInterval: 15_000,
  });

  // ── Derived: lookups ──
  const hangerById = useMemo(() => {
    const m = new Map<string, Hanger>();
    for (const h of hangersQ.data?.hangers ?? []) m.set(h.id, h);
    return m;
  }, [hangersQ.data]);
  const buildingById = useMemo(() => {
    const m = new Map<string, Building>();
    for (const b of buildingsQ.data?.buildings ?? []) m.set(b.id, b);
    return m;
  }, [buildingsQ.data]);

  // Open spill alerts (the cleaning hazards being signed right now).
  const spills = useMemo(
    () => (alertsQ.data?.alerts ?? []).filter((a) => a.kind === "spill" && a.status !== "closed"),
    [alertsQ.data],
  );

  // ── Active-spill cards for the banner ──
  const spillCards = useMemo<SpillCardData[]>(() => {
    // Newest first so the banner leads with the freshest hazard.
    const ordered = [...spills].sort((a, b) => +new Date(b.openedAt) - +new Date(a.openedAt));
    return ordered.map((a) => {
      const hanger = hangerById.get(a.hangerId);
      const building = hanger?.buildingId ? buildingById.get(hanger.buildingId) : undefined;
      const where = a.zoneName ?? a.floorName ?? "Unassigned zone";
      const site = building?.name ?? a.floorName ?? "Site";
      const hangerName = hanger?.name ? `Hanger ${hanger.name}` : "Unassigned hanger";
      // An acknowledged spill = a cleaner has it; an open one is still being
      // routed. Use that to drive the status line + escalation chip + bar.
      const ack = a.status === "acknowledged";
      const mins = minsAgo(a.openedAt);
      // Escalate visually as a spill ages while still unacknowledged.
      const escalation = ack
        ? null
        : mins >= 10
          ? { label: "Escalated", tone: "red" as const }
          : { label: `Esc ${Math.max(1, 10 - mins)}m`, tone: "amber" as const };
      return {
        id: a.id,
        code: `SP-${a.id.replace(/[^0-9]/g, "").slice(-4).padStart(4, "0") || "0000"}`,
        ago: shortAgo(a.openedAt),
        title: where,
        location: `${site} · ${hangerName}`,
        status: ack ? "Cleaner en route" : mins >= 5 ? "Sign deployed, awaiting cleaner" : "Cleaner notified",
        tone: ack ? "red" : mins >= 5 ? "amber" : "slate",
        progress: ack ? 70 : Math.min(60, 15 + mins * 4),
        escalation,
      } satisfies SpillCardData;
    });
  }, [spills, hangerById, buildingById]);

  // Distinct sites currently affected by a spill (for the banner summary line).
  const spillSiteCount = useMemo(() => {
    const ids = new Set<string>();
    for (const a of spills) {
      const h = hangerById.get(a.hangerId);
      if (h?.buildingId) ids.add(h.buildingId);
      else if (a.floorName) ids.add(a.floorName);
    }
    return ids.size || (spills.length ? 1 : 0);
  }, [spills, hangerById]);

  // ── Maintenance helpers ──
  const openJobs = useMemo(
    () => (jobsQ.data?.jobs ?? []).filter((j) => !DONE.has(j.status)),
    [jobsQ.data],
  );
  const activePpms = useMemo(() => (ppmsQ.data?.ppms ?? []).filter((p) => p.active), [ppmsQ.data]);
  const overduePpms = useMemo(() => activePpms.filter((p) => daysUntil(p.nextDueDate) < 0), [activePpms]);
  const pmCompliance = activePpms.length
    ? Math.round(((activePpms.length - overduePpms.length) / activePpms.length) * 100)
    : 100;
  const lowParts = useMemo(
    () => (partsQ.data?.parts ?? []).filter((p) => p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel)),
    [partsQ.data],
  );

  // ── Security helpers ──
  const sessions = sessionsQ.data?.sessions ?? [];
  const activeSessions = sessions.filter((s) => s.status === "active");
  const alarmSessions = sessions.filter((s) => s.status === "alarm");
  const guardsOnDuty = (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt && u.onDuty);
  const cleanersOnShift = (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt && u.onDuty && u.role === "cleaner");

  // ── The unified live operations feed (all-teams) ──
  const feedRows = useMemo<FeedRowData[]>(() => {
    const rows: FeedRowData[] = [];

    // Spills first, newest first (already the natural order of `spills`).
    for (const a of spills) {
      const hanger = hangerById.get(a.hangerId);
      const building = hanger?.buildingId ? buildingById.get(hanger.buildingId) : undefined;
      const where = a.zoneName ?? a.floorName ?? "Unassigned zone";
      const ack = a.status === "acknowledged";
      rows.push({
        id: `alert-${a.id}`,
        kind: "spill",
        title: `Spill detected — ${where}`,
        live: true,
        site: building?.name ?? a.floorName ?? undefined,
        detail: `${ack ? "Cleaner en route" : "Sign deployed, awaiting cleaner"}${hanger?.name ? ` · Hanger ${hanger.name}` : ""}`,
        ago: shortAgo(a.openedAt),
        to: `/alerts/${a.id}`,
        _ts: +new Date(a.openedAt),
      } as FeedRowData & { _ts: number });
    }

    // Maintenance — emergencies + recent open work orders.
    for (const j of openJobs) {
      const building = j.buildingId ? buildingById.get(j.buildingId) : undefined;
      const emergency = j.priority === "emergency";
      const tendering = j.status === "tendering";
      rows.push({
        id: `job-${j.id}`,
        kind: "maintenance",
        title: j.title,
        site: building?.name ?? undefined,
        detail: emergency ? "Emergency — SLA countdown" : tendering ? "Out to tender" : "Open work order",
        ago: shortAgo(j.createdAt),
        to: "/maintenance",
        _ts: j.createdAt ? +new Date(j.createdAt) : 0,
      } as FeedRowData & { _ts: number });
    }

    // Security — overdue PPMs feel like maintenance; lone-worker alarms/overdue
    // are the security signal worth surfacing in the feed.
    for (const s of alarmSessions) {
      rows.push({
        id: `lw-${s.id}`,
        kind: "security",
        title: `Lone-worker alarm — ${s.userName ?? "guard"}`,
        detail: "Missed check-in escalated",
        ago: "",
        to: "/lone-worker",
        _ts: Date.now(),
      } as FeedRowData & { _ts: number });
    }
    for (const s of activeSessions) {
      if (!s.nextCheckInDueAt) continue;
      const due = new Date(s.nextCheckInDueAt).getTime();
      if (due > Date.now()) continue; // only overdue ones are noteworthy
      rows.push({
        id: `lw-${s.id}`,
        kind: "security",
        title: `Lone-worker check-in overdue — ${s.userName ?? "guard"}`,
        detail: "Auto follow-up sent",
        ago: shortAgo(s.nextCheckInDueAt),
        to: "/lone-worker",
        _ts: due,
      } as FeedRowData & { _ts: number });
    }

    // Spills always lead; the rest sorts by recency.
    rows.sort((a, b) => {
      const sa = a.kind === "spill" ? 0 : 1;
      const sb = b.kind === "spill" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return ((b as any)._ts ?? 0) - ((a as any)._ts ?? 0);
    });
    return rows.slice(0, 8);
  }, [spills, openJobs, alarmSessions, activeSessions, hangerById, buildingById]);

  // ── Sites rollup (right column) — buildings ranked by open work orders ──
  const siteRows = useMemo<SiteRow[]>(() => {
    const buildings = buildingsQ.data?.buildings ?? [];
    const jobsByBuilding = new Map<string, number>();
    for (const j of openJobs) {
      if (!j.buildingId) continue;
      jobsByBuilding.set(j.buildingId, (jobsByBuilding.get(j.buildingId) ?? 0) + 1);
    }
    const rows: SiteRow[] = buildings.map((b) => ({
      id: b.id,
      name: b.name,
      sub: b.address ?? undefined,
      count: jobsByBuilding.get(b.id) ?? 0,
    }));
    rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return rows.slice(0, 8);
  }, [buildingsQ.data, openJobs]);

  if (!user) return null;

  // ── Greeting ──
  const firstName = (user.name?.trim().split(/\s+/)[0]) || user.name || "there";
  const teamLabel = TEAMS.find((t) => t.key === team)?.label ?? "All teams";
  const greetingTitle =
    team === "all"
      ? `${greetingPrefix()}, ${firstName}`
      : `${teamLabel} team — ${dayName()} ${timeOfDay()}`;
  const greetingSub =
    team === "all"
      ? `Cleaning, maintenance and security across ${buildingById.size || (sitesQ.data?.sites.length ?? 0)} sites — live, in one place.`
      : team === "cleaning"
        ? "Rounds, spills, inspections and smart signs across your sites."
        : team === "maintenance"
          ? "Work orders, PPM, parts and meters across your sites."
          : "Patrols, incidents, checkpoints and lone-workers across your sites.";

  const ctaLabel = team === "security" ? "Log incident" : team === "cleaning" ? "New round" : "New work order";
  const ctaTo = team === "security" ? "/incidents" : team === "cleaning" ? "/schedule" : "/maintenance";

  return (
    <div>
      {/* ── Header: greeting + primary CTA ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{greetingTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{greetingSub}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link to={ctaTo} className="btn-primary">
            <Icons.plus className="h-4 w-4" />
            {ctaLabel}
          </Link>
        </div>
      </div>

      {/* ── Team switcher ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
          {TEAMS.map((t) => (
            <button
              key={t.key}
              onClick={() => pickTeam(t.key)}
              className={
                "rounded-md px-3 py-1.5 font-medium transition " +
                (team === t.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={makeDefault}
          disabled={isDefault}
          className="text-xs font-medium text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          {isDefault ? "This is your default view" : "Make this my default"}
        </button>
      </div>

      {!isStaff ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Team dashboards are for admins and supervisors.
        </div>
      ) : team === "all" ? (
        <AllTeams
          spillCards={spillCards}
          spillSiteCount={spillSiteCount}
          kpis={[
            { to: "/", icon: Icons.warning, tint: "red", label: "Active spills", value: spills.length, sub: "signs on the floor right now", live: true, valueClass: spills.length ? "text-red-600" : "" },
            { to: "/maintenance", icon: Icons.wrench, tint: "blue", label: "Open work orders", value: openJobs.length, sub: "vs. last week", trendText: openJobs.length ? "tracking" : "—", trend: null, trendTone: "muted" },
            { to: "/ppms", icon: Icons.gauge, tint: "emerald", label: "PM compliance", value: `${pmCompliance}%`, sub: overduePpms.length ? `${overduePpms.length} overdue` : "planned jobs on time", trendTone: overduePpms.length ? "bad" : "good" },
            { to: "/maintenance-kpis", icon: Icons.clock, tint: "indigo", label: "Open PMs due", value: overduePpms.length, sub: "preventive jobs overdue", trendTone: overduePpms.length ? "bad" : "muted" },
            { to: "/lone-worker", icon: Icons.shield, tint: "amber", label: "Lone-workers active", value: activeSessions.length, sub: alarmSessions.length ? `${alarmSessions.length} in alarm` : "checked in within window", live: true, valueClass: alarmSessions.length ? "text-red-600" : "" },
          ]}
          feedRows={feedRows}
          siteRows={siteRows}
          cleaningStats={[
            { value: `${cleanersOnShift.length}`, label: "on shift" },
            { value: `${spills.length}`, label: spills.length === 1 ? "spill active" : "spills active" },
            { value: `${lowParts.length}`, label: "low stock" },
          ]}
          maintenanceStats={[
            { value: `${openJobs.length}`, label: "open jobs" },
            { value: `${overduePpms.length}`, label: "PMs due" },
            { value: `${pmCompliance}%`, label: "PM compliant" },
          ]}
          securityStats={[
            { value: `${guardsOnDuty.length}`, label: "on duty" },
            { value: `${alarmSessions.length}`, label: "incidents" },
            { value: `${activeSessions.length}`, label: "lone-workers" },
          ]}
        />
      ) : (
        <PerTeam
          team={team}
          // Cleaning hero
          spillCount={spills.length}
          spillSiteCount={spillSiteCount}
          // Maintenance hero
          openJobsCount={openJobs.length}
          ppmsDueThisWeek={activePpms.filter((p) => { const d = daysUntil(p.nextDueDate); return d >= 0 && d <= 7; }).length}
          overdueJobs={openJobs.filter((j) => j.priority === "emergency").length}
          // Security hero
          activeSessions={activeSessions.length}
          alarmSessions={alarmSessions.length}
          // KPI inputs
          kpis={teamKpis(team, {
            spills: spills.length,
            cleanersOnShift: cleanersOnShift.length,
            inspectionScore: 0,
            openJobs: openJobs.length,
            pmCompliance,
            overduePpms: overduePpms.length,
            lowParts: lowParts.length,
            guardsOnDuty: guardsOnDuty.length,
            activeSessions: activeSessions.length,
            alarmSessions: alarmSessions.length,
            dispatchesActive: (dispatchesQ.data?.dispatches ?? []).filter((d) => d.status !== "completed").length,
          })}
        />
      )}
    </div>
  );
}

/* ── All-teams layout ────────────────────────────────────────────────────────── */

function AllTeams({
  spillCards, spillSiteCount, kpis, feedRows, siteRows, cleaningStats, maintenanceStats, securityStats,
}: {
  spillCards: SpillCardData[];
  spillSiteCount: number;
  kpis: StatCardProps[];
  feedRows: FeedRowData[];
  siteRows: SiteRow[];
  cleaningStats: { value: string; label: string }[];
  maintenanceStats: { value: string; label: string }[];
  securityStats: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-5">
      <SpillsBanner spills={spillCards} siteCount={spillSiteCount} />

      {/* KPI row — five equal cards, wrapping on small screens. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      {/* Main grid — feed (left ~62%) + summaries/sites (right ~38%). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.62fr_1fr]">
        <LiveFeed rows={feedRows} />
        <div className="space-y-5">
          <DisciplineCard icon={Icons.spill} tint="emerald" title="Cleaning" sub="Rounds · spills · inspections" to="/" stats={cleaningStats} />
          <DisciplineCard icon={Icons.wrench} tint="amber" title="Maintenance" sub="CMMS · assets · contractors" to="/maintenance" stats={maintenanceStats} />
          <DisciplineCard icon={Icons.shield} tint="indigo" title="Security" sub="Patrols · incidents · lone-worker" to="/lone-worker" stats={securityStats} />
          <SitesCard sites={siteRows} />
        </div>
      </div>
    </div>
  );
}

/* ── Per-team layout ───────────────────────────────────────────────────────── */

function PerTeam({
  team, spillCount, spillSiteCount, openJobsCount, ppmsDueThisWeek, overdueJobs, activeSessions, alarmSessions, kpis,
}: {
  team: Team;
  spillCount: number;
  spillSiteCount: number;
  openJobsCount: number;
  ppmsDueThisWeek: number;
  overdueJobs: number;
  activeSessions: number;
  alarmSessions: number;
  kpis: StatCardProps[];
}) {
  const hero =
    team === "cleaning" ? (
      <HeroBanner
        tone="red"
        icon={Icons.spill}
        title="Active spills"
        count={spillCount}
        live
        summary={`${spillCount} hazard${spillCount === 1 ? "" : "s"} being signed across ${spillSiteCount} site${spillSiteCount === 1 ? "" : "s"}`}
        actionLabel="View all alerts"
        actionTo="/"
      />
    ) : team === "maintenance" ? (
      <HeroBanner
        tone="amber"
        icon={Icons.wrench}
        title="Open work orders"
        count={openJobsCount}
        summary={`${overdueJobs} emergency · ${ppmsDueThisWeek} PM${ppmsDueThisWeek === 1 ? "" : "s"} due this week`}
        actionLabel="View all work"
        actionTo="/maintenance"
      />
    ) : (
      <HeroBanner
        tone="indigo"
        icon={Icons.shield}
        title="Patrols and lone-workers"
        count={activeSessions}
        live
        summary={`${alarmSessions} open incident${alarmSessions === 1 ? "" : "s"} · ${activeSessions} lone-worker${activeSessions === 1 ? "" : "s"} active`}
        actionLabel="Open security"
        actionTo="/lone-worker"
      />
    );

  return (
    <div className="space-y-5">
      {hero}

      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <StatCard key={k.label} {...k} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.62fr_1fr]">
        <AttentionQueue team={team} />
        <div>
          {team === "cleaning" ? <CleaningColumn /> : team === "maintenance" ? <MaintenanceColumn /> : <SecurityColumn />}
        </div>
      </div>
    </div>
  );
}

/* Build the four discipline KPI tiles for a per-team view. */
function teamKpis(
  team: Team,
  d: {
    spills: number; cleanersOnShift: number; inspectionScore: number;
    openJobs: number; pmCompliance: number; overduePpms: number; lowParts: number;
    guardsOnDuty: number; activeSessions: number; alarmSessions: number; dispatchesActive: number;
  },
): StatCardProps[] {
  if (team === "cleaning") {
    return [
      { to: "/", icon: Icons.warning, tint: "red", label: "Active spills", value: d.spills, sub: "signs deployed now", live: true, valueClass: d.spills ? "text-red-600" : "" },
      { to: "/users", icon: Icons.sparkles, tint: "emerald", label: "Cleaners on shift", value: d.cleanersOnShift, sub: "on duty across all sites" },
      { to: "/dispatch", icon: Icons.activity, tint: "blue", label: "Open dispatches", value: d.dispatchesActive, sub: "jobs sent to cleaners" },
      { to: "/parts", icon: Icons.clipboard, tint: "amber", label: "Low consumables", value: d.lowParts, sub: "at/below reorder level", trendTone: d.lowParts ? "bad" : "muted" },
    ];
  }
  if (team === "maintenance") {
    return [
      { to: "/maintenance", icon: Icons.wrench, tint: "blue", label: "Open work orders", value: d.openJobs, sub: "vs. last week", trendTone: "muted" },
      { to: "/ppms", icon: Icons.gauge, tint: "emerald", label: "PM compliance", value: `${d.pmCompliance}%`, sub: d.overduePpms ? `${d.overduePpms} overdue` : "planned jobs on time", trendTone: d.overduePpms ? "bad" : "good" },
      { to: "/maintenance-kpis", icon: Icons.clock, tint: "indigo", label: "PMs due", value: d.overduePpms, sub: "preventive jobs overdue", trendTone: d.overduePpms ? "bad" : "muted" },
      { to: "/parts", icon: Icons.clipboard, tint: "amber", label: "Parts low", value: d.lowParts, sub: "at/below min level", trendTone: d.lowParts ? "bad" : "muted" },
    ];
  }
  // security
  return [
    { to: "/incidents", icon: Icons.warning, tint: "amber", label: "Open incidents", value: d.alarmSessions, sub: "awaiting close-out", trendTone: d.alarmSessions ? "bad" : "muted" },
    { to: "/lone-worker", icon: Icons.shield, tint: "indigo", label: "Lone-workers active", value: d.activeSessions, sub: "checked in within window", live: true, valueClass: d.alarmSessions ? "text-red-600" : "" },
    { to: "/users", icon: Icons.sparkles, tint: "emerald", label: "Guards on duty", value: d.guardsOnDuty, sub: "on duty across all sites" },
    { to: "/checkpoints", icon: Icons.clipboard, tint: "blue", label: "Checkpoints", value: "—", sub: "patrol scans on track" },
  ];
}

export default TeamDashboard;
