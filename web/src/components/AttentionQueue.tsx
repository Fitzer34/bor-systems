import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Section } from "../lib/section";

/* ─── AttentionQueue ──────────────────────────────────────────────────────────
 *
 * The cross-discipline "Needs your attention" feed for the team dashboard. It
 * merges the most pressing items from every existing list endpoint into a single
 * urgency-sorted list:
 *
 *   • open spill alerts            (cleaning)   → /alerts/:id
 *   • SLA-at-risk jobs             (maintenance)→ /maintenance   (open + emergency)
 *   • quotes awaiting approval     (maintenance)→ /maintenance   (status=tendering)
 *   • overdue PPMs                 (maintenance)→ /ppms
 *   • low-stock parts              (maintenance)→ /parts
 *   • lone-worker check-ins due    (security)   → /lone-worker
 *
 * `team` narrows the list to one discipline ("all" shows everything). Everything
 * is derived client-side from the same staff endpoints the rest of the app uses
 * — no new backend. Each query is gated to staff so a non-staff viewer never
 * fires a 403.
 */

type Team = Section | "all";
type Urgency = "critical" | "warning" | "info";

interface QueueItem {
  id: string;
  team: Section;
  urgency: Urgency;
  /** Short category, e.g. "Spill" / "Overdue PPM". */
  tag: string;
  title: string;
  sub: string;
  to: string;
}

interface ActiveAlert {
  id: string; status: "open" | "acknowledged" | "closed"; kind: "spill" | "planned_cleaning";
  openedAt: string; zoneName: string | null; floorName: string | null;
}
interface Job { id: string; title: string; status: string; priority?: string; createdAt?: string }
interface Ppm { id: string; title: string; nextDueDate: string; active: boolean; contractorName: string | null }
interface Part { id: string; name: string; stockQty: number; reorderLevel: number }
interface MonSession {
  id: string; status: "active" | "ended" | "alarm"; userName: string | null;
  nextCheckInDueAt: string | null; alarmReason: string | null;
}

const DONE = new Set(["completed", "cancelled"]);

function daysUntil(iso: string): number {
  const due = Date.parse(iso + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((due - today) / 86_400_000);
}
function minsAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}
function fmtAgo(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const URGENCY_RANK: Record<Urgency, number> = { critical: 0, warning: 1, info: 2 };
const URGENCY_PILL: Record<Urgency, string> = {
  critical: "pill-alert",
  warning: "pill-offline",
  info: "pill-info",
};

export function AttentionQueue({ team = "all", limit = 8 }: { team?: Team; limit?: number }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";

  const wants = (t: Section) => team === "all" || team === t;

  // Each query only runs when this viewer is staff AND the team is in scope, so
  // a narrowed dashboard doesn't fetch the other disciplines' data needlessly.
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
  const sessionsQ = useQuery({
    queryKey: ["lone-worker-sessions"],
    queryFn: () => api<{ sessions: MonSession[] }>("/lone-worker/sessions"),
    enabled: isStaff && wants("security"),
    refetchInterval: 15_000,
  });

  const items = useMemo<QueueItem[]>(() => {
    const out: QueueItem[] = [];

    // ── Cleaning: open spill alerts ──
    if (wants("cleaning")) {
      for (const a of alertsQ.data?.alerts ?? []) {
        if (a.kind !== "spill" || a.status === "closed") continue;
        const open = a.status === "open";
        out.push({
          id: `alert-${a.id}`,
          team: "cleaning",
          urgency: open ? "critical" : "warning",
          tag: "Spill",
          title: `${a.floorName ?? "Unknown floor"} — ${a.zoneName ?? "Unassigned zone"}`,
          sub: `${open ? "Unacknowledged" : "In progress"} · lifted ${fmtAgo(minsAgo(a.openedAt))}`,
          to: `/alerts/${a.id}`,
        });
      }
    }

    // ── Maintenance: SLA-at-risk (open emergency), awaiting approval, PPMs, stock ──
    if (wants("maintenance")) {
      const jobs = jobsQ.data?.jobs ?? [];
      for (const j of jobs) {
        if (DONE.has(j.status)) continue;
        if (j.priority === "emergency") {
          out.push({
            id: `job-sla-${j.id}`,
            team: "maintenance",
            urgency: "critical",
            tag: "SLA at risk",
            title: j.title,
            sub: "Emergency job still open",
            to: "/maintenance",
          });
        } else if (j.status === "tendering") {
          out.push({
            id: `job-quote-${j.id}`,
            team: "maintenance",
            urgency: "warning",
            tag: "Quote to approve",
            title: j.title,
            sub: "Out to tender — awaiting your decision",
            to: "/maintenance",
          });
        }
      }
      for (const p of (ppmsQ.data?.ppms ?? []).filter((x) => x.active)) {
        const d = daysUntil(p.nextDueDate);
        if (d < 0) {
          out.push({
            id: `ppm-${p.id}`,
            team: "maintenance",
            urgency: "warning",
            tag: "Overdue PPM",
            title: p.title,
            sub: `${-d}d overdue · ${p.contractorName ?? "No contractor"}`,
            to: "/ppms",
          });
        }
      }
      for (const p of partsQ.data?.parts ?? []) {
        const low = p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel);
        if (!low) continue;
        out.push({
          id: `part-${p.id}`,
          team: "maintenance",
          urgency: p.stockQty <= 0 ? "warning" : "info",
          tag: "Low stock",
          title: p.name,
          sub: p.stockQty <= 0 ? "Out of stock" : `${p.stockQty} left · reorder at ${p.reorderLevel}`,
          to: "/parts",
        });
      }
    }

    // ── Security: lone-worker check-ins due / in alarm ──
    if (wants("security")) {
      for (const s of sessionsQ.data?.sessions ?? []) {
        if (s.status === "alarm") {
          out.push({
            id: `lw-${s.id}`,
            team: "security",
            urgency: "critical",
            tag: "Check-in alarm",
            title: s.userName ?? "Lone worker",
            sub: s.alarmReason ? `Alarm: ${s.alarmReason}` : "Missed check-in escalated",
            to: "/lone-worker",
          });
        } else if (s.status === "active" && s.nextCheckInDueAt) {
          const due = new Date(s.nextCheckInDueAt).getTime();
          const overdue = due <= Date.now();
          const soon = due - Date.now() <= 5 * 60_000;
          if (overdue || soon) {
            out.push({
              id: `lw-${s.id}`,
              team: "security",
              urgency: overdue ? "critical" : "info",
              tag: "Check-in due",
              title: s.userName ?? "Lone worker",
              sub: overdue ? "Check-in overdue" : "Check-in due shortly",
              to: "/lone-worker",
            });
          }
        }
      }
    }

    out.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
    return out;
  }, [alertsQ.data, jobsQ.data, ppmsQ.data, partsQ.data, sessionsQ.data, team]);

  const loading =
    (alertsQ.isLoading && alertsQ.fetchStatus !== "idle") ||
    (jobsQ.isLoading && jobsQ.fetchStatus !== "idle") ||
    (sessionsQ.isLoading && sessionsQ.fetchStatus !== "idle");

  const shown = items.slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Needs your attention</h2>
        {items.length > 0 && (
          <span className="text-xs text-slate-500">{items.length} item{items.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="text-sm text-slate-500 py-4">Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-emerald-700">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Nothing needs your attention right now.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((it) => (
            <li key={it.id}>
              <Link to={it.to} className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-slate-50 transition">
                <span className={URGENCY_PILL[it.urgency] + " shrink-0"}>{it.tag}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{it.title}</span>
                  <span className="block truncate text-xs text-slate-500">{it.sub}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </li>
          ))}
          {items.length > shown.length && (
            <li className="pt-2 text-xs text-slate-500">+{items.length - shown.length} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default AttentionQueue;
