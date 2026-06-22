import { Link } from "react-router-dom";

/* ─── Dashboard primitives ────────────────────────────────────────────────────
 *
 * Shared presentational building blocks for the team dashboard, styled to the
 * HazardLink design system (white .card surfaces, #E6EAF0 hairlines, trust-blue
 * primary, tinted icon chips). Pure presentation — all data is passed in by the
 * dashboard, which derives it from the existing query hooks.
 */

/* ── Small inline icons (stroke, currentColor) ─────────────────────────────── */

type IconProps = { className?: string };

export const Icons = {
  spill: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M12 2.7s6 6.3 6 10.3a6 6 0 0 1-12 0c0-4 6-10.3 6-10.3Z" />
    </svg>
  ),
  wrench: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.1-.3-.3-2.1 2.4-2.4Z" />
    </svg>
  ),
  shield: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
    </svg>
  ),
  warning: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  clipboard: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M9 2h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Z" /><path d="M9 4h6" />
    </svg>
  ),
  clock: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  gauge: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M12 13a3 3 0 1 0-3-3" /><path d="M3.5 18a9 9 0 1 1 17 0Z" />
    </svg>
  ),
  activity: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />
    </svg>
  ),
  sparkles: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
    </svg>
  ),
  pin: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  building: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </svg>
  ),
  plus: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  chevron: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  trendUp: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" />
    </svg>
  ),
  trendDown: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
      <polyline points="3 7 9 13 13 9 21 17" /><polyline points="15 17 21 17 21 11" />
    </svg>
  ),
};

/* Tint presets for icon chips (bg + text). */
export const CHIP_TINT = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  indigo: "bg-indigo-50 text-indigo-600",
  slate: "bg-slate-100 text-slate-500",
} as const;
export type ChipTint = keyof typeof CHIP_TINT;

/* ── LIVE tag ──────────────────────────────────────────────────────────────── */

export function LiveTag() {
  return <span className="live-tag">Live</span>;
}

/* ── KPI / stat card ───────────────────────────────────────────────────────── */

export type Trend = "up" | "down" | null;

export interface StatCardProps {
  to: string;
  icon: (p: IconProps) => JSX.Element;
  tint: ChipTint;
  label: string;
  value: string | number;
  sub?: string;
  /** Coloured trend prefix on the sub line ("+3%", "-0.4d"…). */
  trendText?: string;
  trend?: Trend;
  /** Green is the default "good" trend colour; pass "bad" to flip to red. */
  trendTone?: "good" | "bad" | "muted";
  live?: boolean;
  /** Override the big value colour (e.g. red for active spills). */
  valueClass?: string;
}

export function StatCard({
  to, icon: Icon, tint, label, value, sub, trendText, trend, trendTone = "good", live, valueClass,
}: StatCardProps) {
  const trendColor =
    trendTone === "bad" ? "text-red-600" : trendTone === "muted" ? "text-slate-500" : "text-emerald-600";
  return (
    <Link to={to} className="card card-hover flex flex-col">
      <div className="flex items-center justify-between">
        <span className={"icon-chip " + CHIP_TINT[tint]}>
          <Icon className="h-5 w-5" />
        </span>
        {live && <LiveTag />}
      </div>
      <div className="mt-3 text-sm font-medium text-slate-600">{label}</div>
      <div className={"mt-0.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums " + (valueClass ?? "")}>
        {value}
      </div>
      {(trendText || sub) && (
        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          {trendText && (
            <span className={"inline-flex items-center gap-0.5 font-medium " + trendColor}>
              {trend === "up" && <Icons.trendUp className="h-3.5 w-3.5" />}
              {trend === "down" && <Icons.trendDown className="h-3.5 w-3.5" />}
              {trendText}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </Link>
  );
}

/* ── Card header (title + optional Live tag + optional right link/label) ─────── */

export function CardHeader({
  title, sub, live, rightLabel, rightTo,
}: {
  title: string;
  sub?: string;
  live?: boolean;
  rightLabel?: string;
  rightTo?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {live && <LiveTag />}
        </div>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {rightLabel && (
        rightTo ? (
          <Link to={rightTo} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
            {rightLabel}
            <Icons.chevron className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400">{rightLabel}</span>
        )
      )}
    </div>
  );
}
