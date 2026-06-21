import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useNotifications,
  useMarkAllRead,
  useMarkRead,
  notificationHref,
  notificationTypeLabel,
  type AppNotification,
} from "../lib/notifications";

/* ─── Notifications (full page) ────────────────────────────────────────────────
 *
 * The "See all" destination from the header panel. Filter by event type and by
 * read/unread, and act on a row inline (mark read, or open its entity). Reads
 * the same feed query the panel uses (a larger page).
 */

type ReadFilter = "all" | "unread" | "read";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function Notifications() {
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data, isLoading, error } = useNotifications({ limit: 100 });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const list = data?.notifications ?? [];
  const hasUnread = list.some((n) => !n.readAt);

  // Distinct event types present, for the type dropdown.
  const types = useMemo(() => {
    const s = new Set<string>();
    for (const n of list) s.add(n.type);
    return Array.from(s).sort();
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((n) => {
      if (readFilter === "unread" && n.readAt) return false;
      if (readFilter === "read" && !n.readAt) return false;
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      return true;
    });
  }, [list, readFilter, typeFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-slate-500 mt-0.5">Everything HazardLink has flagged for you.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/notifications/preferences" className="btn-secondary">Preferences</Link>
          <button
            onClick={() => markAllRead.mutate()}
            disabled={!hasUnread || markAllRead.isPending}
            className="btn-secondary"
          >
            Mark all read
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(["all", "unread", "read"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setReadFilter(f)}
              className={
                "px-3 py-1 rounded-md font-medium capitalize transition " +
                (readFilter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
              }
            >
              {f}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input w-auto text-sm py-1.5"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{notificationTypeLabel(t)}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-slate-500">Loading…</div>}
      {error && <div className="text-red-600">Could not load notifications.</div>}

      {!isLoading && !error && (
        filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-slate-900 font-medium">Nothing to show</div>
            <div className="text-slate-500 text-sm mt-1">
              {list.length === 0 ? "You have no notifications yet." : "No notifications match these filters."}
            </div>
          </div>
        ) : (
          <div className="card !p-0 divide-y divide-slate-100">
            {filtered.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onMarkRead={() => markRead.mutate(n.id)}
                markingRead={markRead.isPending}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onMarkRead,
  markingRead,
}: {
  n: AppNotification;
  onMarkRead: () => void;
  markingRead: boolean;
}) {
  const href = notificationHref(n);
  return (
    <div className={"flex items-start gap-3 px-4 py-3 " + (n.readAt ? "" : "bg-blue-50/40")}>
      <span
        aria-hidden="true"
        className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (n.readAt ? "bg-slate-200" : "bg-blue-600")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={"text-sm " + (n.readAt ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {notificationTypeLabel(n.type)}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5 break-words">{n.body}</p>
        <div className="text-xs text-slate-400 mt-1">{fmtWhen(n.createdAt)}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {href && (
          <Link
            to={href}
            onClick={() => { if (!n.readAt) onMarkRead(); }}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
          >
            View →
          </Link>
        )}
        {!n.readAt && (
          <button
            onClick={onMarkRead}
            disabled={markingRead}
            className="text-xs text-slate-500 hover:text-slate-800 whitespace-nowrap disabled:opacity-50"
          >
            Mark read
          </button>
        )}
      </div>
    </div>
  );
}
