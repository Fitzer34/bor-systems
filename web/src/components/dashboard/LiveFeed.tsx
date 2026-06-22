import { Link } from "react-router-dom";
import { Icons, LiveTag, CHIP_TINT, type ChipTint } from "./primitives";

/* ─── LiveFeed ────────────────────────────────────────────────────────────────
 *
 * The "Live operations feed" card — a single urgency-ordered stream of recent
 * activity across disciplines. Each row: a tinted type icon, a bold title (with
 * an optional LIVE tag), a subtitle that can include a coloured site name + a
 * blue work-order reference, and a right-aligned relative time. Whole rows are
 * links. The dashboard builds the FeedRowData[] from existing queries.
 */

export type FeedKind = "spill" | "maintenance" | "security";

export interface FeedRowData {
  id: string;
  kind: FeedKind;
  title: string;
  live?: boolean;
  /** Coloured leading site name (link colour follows the kind). */
  site?: string;
  /** Plain grey detail after the site name. */
  detail?: string;
  /** Optional blue reference shown at the end of the subtitle (e.g. WO-2041). */
  ref?: string;
  ago: string;
  to: string;
}

const KIND_ICON = {
  spill: Icons.spill,
  maintenance: Icons.wrench,
  security: Icons.shield,
} as const;
const KIND_TINT: Record<FeedKind, ChipTint> = {
  spill: "emerald",
  maintenance: "amber",
  security: "indigo",
};
const SITE_COLOR: Record<FeedKind, string> = {
  spill: "text-emerald-600",
  maintenance: "text-amber-600",
  security: "text-indigo-600",
};

function FeedRow({ r }: { r: FeedRowData }) {
  const Icon = KIND_ICON[r.kind];
  return (
    <Link to={r.to} className="flex items-start gap-3 py-3 transition hover:bg-slate-50/70 -mx-1 px-1 rounded-lg">
      <span className={"icon-chip h-8 w-8 " + CHIP_TINT[KIND_TINT[r.kind]]}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{r.title}</span>
          {r.live && <LiveTag />}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">
          {r.site && <span className={"font-medium " + SITE_COLOR[r.kind]}>{r.site}</span>}
          {r.site && (r.detail || r.ref) && <span className="text-slate-400"> · </span>}
          {r.detail && <span>{r.detail}</span>}
          {r.ref && (
            <>
              {r.detail && <span className="text-slate-400"> · </span>}
              <span className="font-medium text-blue-700">{r.ref}</span>
            </>
          )}
        </div>
      </div>
      <span className="shrink-0 pt-0.5 text-xs text-slate-400">{r.ago}</span>
    </Link>
  );
}

export function LiveFeed({
  rows,
  title = "Live operations feed",
  sub = "Spills first — click any row for detail",
  emptyText = "Nothing happening right now.",
}: {
  rows: FeedRowData[];
  title?: string;
  sub?: string;
  emptyText?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <LiveTag />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <FeedRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
