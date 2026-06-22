import { Link } from "react-router-dom";
import { Icons, LiveTag } from "./primitives";

/* ─── SpillsBanner ────────────────────────────────────────────────────────────
 *
 * The full-width "Active spills" banner that leads the dashboard. A soft rose
 * card with a red icon, a count badge, a LIVE tag and a "View all alerts" link;
 * beneath the header, up to three spill cards. Every spill links through to its
 * alert detail page. Data (the SpillCardData[]) is derived by the dashboard from
 * the existing /alerts/active + /hangers + /buildings queries.
 */

export interface SpillCardData {
  id: string;
  /** Short code shown top-left, e.g. "SP-2041". */
  code: string;
  /** Relative time since the spill opened, e.g. "24m". */
  ago: string;
  title: string;
  /** "{Site} · Hanger {name}" location line. */
  location: string;
  /** Status line text, e.g. "Cleaner en route". */
  status: string;
  /** Status dot + bar tone. */
  tone: "red" | "amber" | "slate";
  /** 0–100 progress along the response. */
  progress: number;
  /** Escalation chip, or null. */
  escalation: { label: string; tone: "amber" | "red" } | null;
}

const DOT: Record<SpillCardData["tone"], string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  slate: "bg-slate-400",
};
const FILL: Record<SpillCardData["tone"], string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  slate: "bg-slate-400",
};

function SpillCard({ s }: { s: SpillCardData }) {
  return (
    <Link
      to={`/alerts/${s.id}`}
      className="block rounded-lg border border-[rgb(var(--hl-border))] bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium text-slate-500">{s.code}</span>
        <span className="text-[11px] text-slate-400">{s.ago}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{s.title}</div>
      <div className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
        <Icons.pin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate">{s.location}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
        <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + DOT[s.tone]} />
        <span className="truncate">{s.status}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="track flex-1">
          <div className={"track-fill " + FILL[s.tone]} style={{ width: `${Math.min(100, Math.max(4, s.progress))}%` }} />
        </div>
        {s.escalation && (
          <span
            className={
              "shrink-0 text-[11px] font-medium " +
              (s.escalation.tone === "red" ? "text-red-600" : "text-amber-600")
            }
          >
            {s.escalation.label}
          </span>
        )}
      </div>
    </Link>
  );
}

export function SpillsBanner({
  spills,
  siteCount,
}: {
  spills: SpillCardData[];
  siteCount: number;
}) {
  const n = spills.length;
  return (
    <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-chip bg-red-500 text-white">
            <Icons.warning className="h-5 w-5" />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-slate-900">Active spills</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
              {n}
            </span>
            <LiveTag />
            <span className="text-xs text-slate-500">
              · {n} hazard{n === 1 ? "" : "s"} being signed across {siteCount} site{siteCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <Link
          to="/"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm ring-1 ring-red-200 transition hover:bg-red-50"
        >
          View all alerts
          <Icons.chevron className="h-3.5 w-3.5" />
        </Link>
      </div>

      {n > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spills.slice(0, 3).map((s) => (
            <SpillCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
