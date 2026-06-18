import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface NotificationEntry {
  id: string;
  alertId: string | null;
  userId: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  channel: "push" | "sms" | "email";
  kind: "alert" | "rebroadcast" | "escalation" | "low_battery" | "sign_replacement_needed";
  sentAt: string;
  delivered: boolean | null;
  error: string | null;
}

export function NotificationsLog() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications-log"],
    queryFn: () => api<{ entries: NotificationEntry[] }>("/admin/notifications-log?limit=300"),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Notifications log</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every push, SMS, and email the system has sent. Use this to verify a notification reached its recipient,
        or to find out why one didn't.
      </p>

      {isLoading && <div className="text-slate-500">Loading…</div>}
      {error && <div className="text-red-600">Could not load notifications log.</div>}

      {data && (
        <div className="card p-0 overflow-hidden">
        <div className="table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">Sent</th>
              <th className="p-2">Recipient</th>
              <th className="p-2">Channel</th>
              <th className="p-2">Kind</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((n) => (
              <tr key={n.id} className="border-t border-slate-200/80 align-top">
                <td className="p-2 whitespace-nowrap text-slate-500">{new Date(n.sentAt).toLocaleString()}</td>
                <td className="p-2">{n.recipientName ?? <span className="text-slate-500">Deleted user</span>}<div className="text-xs text-slate-500">{n.recipientEmail}</div></td>
                <td className="p-2"><span className="font-mono text-xs">{n.channel}</span></td>
                <td className="p-2"><span className="font-mono text-xs">{n.kind}</span></td>
                <td className="p-2">
                  {n.delivered === true ? (
                    <span className="pill-online">Delivered</span>
                  ) : n.delivered === false && n.error ? (
                    <span className="pill-alert" title={n.error}>{n.error.length > 40 ? `${n.error.slice(0, 40)}…` : n.error}</span>
                  ) : (
                    <span className="pill-muted">Pending</span>
                  )}
                </td>
              </tr>
            ))}
            {data.entries.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">No notifications sent yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        </div>
      )}
    </div>
  );
}
