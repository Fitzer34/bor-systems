import { Link } from "react-router-dom";
import { Icons, CHIP_TINT, type ChipTint } from "./primitives";

/* ─── Discipline summary + Sites cards ────────────────────────────────────────
 *
 * The all-teams right column: three compact discipline summary cards (Cleaning /
 * Maintenance / Security), each with an icon, a title + sub, an "Open" link and
 * three inline stats; followed by a "Sites" card listing buildings with their
 * open-job counts. All values are passed in from the dashboard's existing hooks.
 */

export interface InlineStat {
  value: string;
  label: string;
}

export function DisciplineCard({
  icon: Icon,
  tint,
  title,
  sub,
  to,
  stats,
}: {
  icon: (p: { className?: string }) => JSX.Element;
  tint: ChipTint;
  title: string;
  sub: string;
  to: string;
  stats: InlineStat[];
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={"icon-chip " + CHIP_TINT[tint]}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="truncate text-xs text-slate-500">{sub}</div>
          </div>
        </div>
        <Link to={to} className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 hover:underline">
          Open
          <Icons.chevron className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="min-w-0">
            <div className="text-base font-semibold tabular-nums text-slate-900">{s.value}</div>
            <div className="truncate text-[11px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface SiteRow {
  id: string;
  name: string;
  sub?: string;
  count: number;
}

export function SitesCard({ sites }: { sites: SiteRow[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="icon-chip h-8 w-8 bg-slate-100 text-slate-500">
            <Icons.building className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold text-slate-900">Sites</h2>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">open jobs</span>
      </div>
      {sites.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">No sites yet.</p>
      ) : (
        <div className="mt-1 divide-y divide-slate-100">
          {sites.map((s) => (
            <Link
              key={s.id}
              to={`/floor-plans?building=${s.id}`}
              className="flex items-center justify-between gap-3 py-2.5 transition hover:bg-slate-50/70 -mx-1 px-1 rounded-lg"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-900">{s.name}</div>
                  {s.sub && <div className="truncate text-xs text-slate-500">{s.sub}</div>}
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">{s.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
