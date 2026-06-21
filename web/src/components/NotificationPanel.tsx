import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useNotifications,
  useMarkAllRead,
  useMarkRead,
  notificationHref,
  notificationTypeLabel,
  type AppNotification,
} from "../lib/notifications";

/* ─── NotificationPanel ───────────────────────────────────────────────────────
 *
 * The dropdown the header bell opens. Shows the most recent feed grouped into
 * Today / Earlier, with an unread dot per row. "Mark all read" clears the
 * badge; "See all" jumps to the full /notifications page. Clicking a row marks
 * it read and navigates to the entity it points at.
 */

function startOfToday(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useNotifications({ limit: 20 });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const list = data?.notifications ?? [];
  const hasUnread = list.some((n) => !n.readAt);

  const { today, earlier } = useMemo(() => {
    const start = startOfToday();
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const n of list) {
      (new Date(n.createdAt).getTime() >= start ? today : earlier).push(n);
    }
    return { today, earlier };
  }, [list]);

  const openItem = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = notificationHref(n);
    onClose();
    if (href) navigate(href);
  };

  return (
    <div
      role="menu"
      aria-label="Notifications"
      className="absolute right-0 mt-2 w-80 sm:w-96 origin-top-right rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-900">Notifications</span>
        <button
          onClick={() => markAllRead.mutate()}
          disabled={!hasUnread || markAllRead.isPending}
          className="text-xs font-medium text-blue-700 hover:underline disabled:text-slate-300 disabled:no-underline"
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-[22rem] overflow-y-auto">
        {isLoading && <div className="px-3 py-6 text-center text-sm text-slate-500">Loading…</div>}
        {error && <div className="px-3 py-6 text-center text-sm text-red-600">Could not load notifications.</div>}
        {!isLoading && !error && list.length === 0 && (
          <div className="px-3 py-8 text-center">
            <div className="text-sm font-medium text-slate-900">You're all caught up</div>
            <div className="text-xs text-slate-500 mt-0.5">New notifications will show here.</div>
          </div>
        )}

        {today.length > 0 && <GroupLabel>Today</GroupLabel>}
        {today.map((n) => <PanelRow key={n.id} n={n} onOpen={() => openItem(n)} />)}

        {earlier.length > 0 && <GroupLabel>Earlier</GroupLabel>}
        {earlier.map((n) => <PanelRow key={n.id} n={n} onOpen={() => openItem(n)} />)}
      </div>

      <button
        onClick={() => { onClose(); navigate("/notifications"); }}
        className="block w-full border-t border-slate-100 px-3 py-2.5 text-center text-sm font-medium text-blue-700 hover:bg-slate-50"
      >
        See all notifications
      </button>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 bg-white px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  );
}

function PanelRow({ n, onOpen }: { n: AppNotification; onOpen: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onOpen}
      className={
        "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50 " +
        (n.readAt ? "" : "bg-blue-50/40")
      }
    >
      <span
        aria-hidden="true"
        className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (n.readAt ? "bg-transparent" : "bg-blue-600")}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={"truncate text-sm " + (n.readAt ? "text-slate-700" : "font-semibold text-slate-900")}>
            {n.title}
          </span>
          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{n.body}</span>
        <span className="mt-1 inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {notificationTypeLabel(n.type)}
        </span>
      </span>
    </button>
  );
}

export default NotificationPanel;
