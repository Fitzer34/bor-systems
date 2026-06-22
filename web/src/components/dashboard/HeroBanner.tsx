import { Link } from "react-router-dom";
import { Icons } from "./primitives";

/* ─── HeroBanner ──────────────────────────────────────────────────────────────
 *
 * The per-team discipline hero — a tinted full-width banner that leads each
 * team's dashboard (Cleaning rose, Maintenance amber, Security indigo). Mirrors
 * the all-teams "Active spills" banner shape: an icon chip, title + count badge
 * + LIVE tag + a small summary line, and a right-aligned action link.
 */

type Tone = "red" | "amber" | "indigo";

const TONE = {
  red: { wrap: "border-red-200/70 bg-red-50/60", chip: "bg-red-500 text-white", badge: "bg-red-500 text-white", link: "text-red-700 ring-red-200 hover:bg-red-50" },
  amber: { wrap: "border-amber-200/70 bg-amber-50/60", chip: "bg-amber-500 text-white", badge: "bg-amber-500 text-white", link: "text-amber-700 ring-amber-200 hover:bg-amber-50" },
  indigo: { wrap: "border-indigo-200/70 bg-indigo-50/60", chip: "bg-indigo-500 text-white", badge: "bg-indigo-500 text-white", link: "text-indigo-700 ring-indigo-200 hover:bg-indigo-50" },
} as const;

export function HeroBanner({
  tone,
  icon: Icon,
  title,
  count,
  live,
  summary,
  actionLabel,
  actionTo,
}: {
  tone: Tone;
  icon: (p: { className?: string }) => JSX.Element;
  title: string;
  count?: number;
  live?: boolean;
  summary: string;
  actionLabel: string;
  actionTo: string;
}) {
  const t = TONE[tone];
  return (
    <div className={"rounded-xl border p-4 shadow-sm " + t.wrap}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={"icon-chip " + t.chip}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-slate-900">{title}</span>
            {count != null && (
              <span className={"inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold " + t.badge}>
                {count}
              </span>
            )}
            {live && <span className="live-tag">Live</span>}
            <span className="text-xs text-slate-500">· {summary}</span>
          </div>
        </div>
        <Link
          to={actionTo}
          className={"shrink-0 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow-sm ring-1 transition " + t.link}
        >
          {actionLabel}
          <Icons.chevron className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
