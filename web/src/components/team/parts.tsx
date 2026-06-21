import { Link } from "react-router-dom";

/* Shared presentational bits for the per-team right-column cards. Keeps the
 * three discipline columns consistent without repeating markup. */

export function ColumnCard({
  title,
  to,
  linkLabel = "View all",
  children,
}: {
  title: string;
  to?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {to && <Link to={to} className="text-xs text-blue-700 hover:underline">{linkLabel} →</Link>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function ColumnRow({
  main,
  sub,
  tag,
  tagClass = "pill-muted",
}: {
  main: string;
  sub?: string;
  tag?: string;
  tagClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate text-slate-900">{main}</div>
        {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
      </div>
      {tag && <span className={"shrink-0 " + tagClass}>{tag}</span>}
    </div>
  );
}

export function ColumnEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
