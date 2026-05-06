import { useQuery } from "@tanstack/react-query";
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

export function Dashboard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Active alerts</h1>
        <button onClick={() => refetch()} className="text-sm text-slate-600 hover:text-slate-900">Refresh</button>
      </div>
      {isLoading && <div className="text-slate-500">Loading…</div>}
      {error && <div className="text-red-600">Could not load alerts.</div>}
      {data && data.alerts.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
          No active alerts. All signs are on their hangers.
        </div>
      )}
      <ul className="space-y-3">
        {data?.alerts.map((a) => (
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
