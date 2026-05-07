import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { AlertFloorPlanThumb } from "../components/AlertFloorPlanThumb";

interface ActiveAlert {
  id: string;
  hangerId: string;
  status: "open" | "acknowledged" | "closed";
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  zoneId: string | null;
  zoneName: string | null;
  floorId: string | null;
  floorName: string | null;
}

interface DispatchRow {
  id: string;
  recipientUserId: string;
  zoneId: string | null;
  zoneName: string | null;
  floorId: string | null;
  message: string;
  status: "sent" | "acknowledged" | "completed";
  sentAt: string;
}

export function Dashboard() {
  const qc = useQueryClient();

  const alerts = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });

  const dispatches = useQuery({
    queryKey: ["dispatches"],
    queryFn: () => api<{ dispatches: DispatchRow[] }>("/dispatches"),
    refetchInterval: 5_000,
  });

  const ackDispatch = useMutation({
    mutationFn: (id: string) => api(`/dispatches/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });
  const completeDispatch = useMutation({
    mutationFn: (id: string) => api(`/dispatches/${id}/complete`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });

  const activeDispatches = (dispatches.data?.dispatches ?? []).filter((d) => d.status !== "completed");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Active alerts</h1>
        <button onClick={() => alerts.refetch()} className="text-sm text-slate-600 hover:text-slate-900">Refresh</button>
      </div>
      {alerts.isLoading && <div className="text-slate-500">Loading…</div>}
      {alerts.error && <div className="text-red-600">Could not load alerts.</div>}
      {alerts.data && alerts.data.alerts.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
          No active spill alerts.
        </div>
      )}
      <ul className="space-y-3">
        {alerts.data?.alerts.map((a) => (
          <li key={a.id}>
            <Link
              to={`/alerts/${a.id}`}
              className={`flex items-center gap-4 rounded-lg border p-4 shadow-sm bg-white hover:shadow ${
                a.status === "open" ? "border-red-300" : "border-amber-300"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900">
                  {a.floorName ?? "Unknown floor"} — {a.zoneName ?? "Unassigned zone"}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Lifted {timeAgo(a.openedAt)} · Status: {a.status}
                </div>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                a.status === "open" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              }`}>
                {a.status === "open" ? "UNACKNOWLEDGED" : "IN PROGRESS"}
              </span>
              <AlertFloorPlanThumb floorId={a.floorId} alertedZoneId={a.zoneId} />
            </Link>
          </li>
        ))}
      </ul>

      {activeDispatches.length > 0 && (
        <>
          <h2 className="text-2xl font-semibold mt-10 mb-3">Dispatches</h2>
          <ul className="space-y-3">
            {activeDispatches.map((d) => (
              <li key={d.id} className="rounded-lg border border-blue-300 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {d.zoneName ? `Go to: ${d.zoneName}` : "Dispatch"}
                    </div>
                    <p className="text-slate-700 mt-1 whitespace-pre-wrap">{d.message}</p>
                    <div className="text-xs text-slate-500 mt-2">
                      Sent {timeAgo(d.sentAt)} · Status: {d.status}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {d.status === "sent" && (
                      <button onClick={() => ackDispatch.mutate(d.id)}
                        className="px-3 py-2 text-sm rounded bg-blue-600 text-white">
                        On my way
                      </button>
                    )}
                    {d.status !== "completed" && (
                      <button onClick={() => completeDispatch.mutate(d.id)}
                        className="px-3 py-2 text-sm rounded border border-slate-300 hover:bg-slate-50">
                        Mark done
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min === 1) return "1 minute ago";
  if (min < 60) return `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr === 1) return "1 hour ago";
  if (hr < 24) return `${hr} hours ago`;
  return new Date(iso).toLocaleString();
}
