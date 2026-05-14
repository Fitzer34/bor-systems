import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AlertFloorPlanThumb } from "../components/AlertFloorPlanThumb";
import { SiteFloorPlansOverview } from "../components/SiteFloorPlansOverview";
import { useTicker } from "../lib/ticker";

interface ActiveAlert {
  id: string;
  hangerId: string;
  status: "open" | "acknowledged" | "closed";
  // "spill" = sign was lifted unexpectedly (shows in the alert list).
  // "planned_cleaning" = cleaner pre-pressed the button to flag planned
  // work (shows only as a blue pin on the floor plan; hidden from list).
  kind: "spill" | "planned_cleaning";
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

interface Hanger {
  id: string;
  status: "active" | "out_of_service" | "decommissioned";
  lastSeenAt: string | null;
}

/** Match the 3-minute online window used elsewhere — WiFi-Pi hangers
 *  heartbeat every 60 seconds, so 3 minutes is two missed beats. */
// Tight 15-second window — Pi heartbeats every 5 seconds, so this allows
// 2 missed beats before flipping to Offline. Combined with a 1-second
// ticker re-render, worst-case unplug detection is ~16 seconds.
const ONLINE_WINDOW_MS = 15 * 1000;

export function Dashboard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  // Forces a re-render every second so the Online/Offline computation
  // (which depends on Date.now()) flips the instant the threshold is crossed,
  // even between React Query refetches.
  useTicker(1000);

  const alerts = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 3_000,
  });

  const dispatches = useQuery({
    queryKey: ["dispatches"],
    queryFn: () => api<{ dispatches: DispatchRow[] }>("/dispatches"),
    refetchInterval: 3_000,
  });

  // Fetch hangers so each alert can show whether the reporting hanger has
  // gone offline since (e.g. it sent "lifted" then died — the spill is still
  // there but you can't rely on getting a "returned" event). 5s polling so
  // the Offline indicator flips within seconds of the Pi going dark.
  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 5_000,
  });

  const offlineHangerIds = new Set<string>();
  const now = Date.now();
  for (const h of hangers.data?.hangers ?? []) {
    if (h.status !== "active") continue;
    const fresh = h.lastSeenAt != null && now - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
    if (!fresh) offlineHangerIds.add(h.id);
  }

  const ackDispatch = useMutation({
    mutationFn: (id: string) => api(`/dispatches/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });
  const completeDispatch = useMutation({
    mutationFn: (id: string) => api(`/dispatches/${id}/complete`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });

  // Only show dispatches assigned TO the current user on their Active alerts
  // page. Admins and supervisors still see every dispatch in the full
  // Dispatch tab, but the "what do I need to do right now" feed should be
  // strictly their own action items.
  const activeDispatches = (dispatches.data?.dispatches ?? [])
    .filter((d) => d.status !== "completed" && d.recipientUserId === user?.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Active alerts</h1>
        <button onClick={() => alerts.refetch()} className="text-sm text-slate-600 hover:text-slate-900">Refresh</button>
      </div>
      {alerts.isLoading && <div className="text-slate-500">Loading…</div>}
      {alerts.error && <div className="text-red-600">Could not load alerts.</div>}
      {/* Planned-cleaning sessions are blue pins on the map only — not list entries. */}
      {(() => null)()}
      {alerts.data && alerts.data.alerts.filter((a) => a.kind === "spill").length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
          No active spill alerts.
        </div>
      )}
      <ul className="space-y-3">
        {alerts.data?.alerts.filter((a) => a.kind === "spill").map((a) => (
          <li key={a.id}>
            <Link
              to={`/alerts/${a.id}`}
              className={`flex items-center gap-4 rounded-lg border p-4 shadow-sm bg-white hover:shadow ${
                a.status === "open" ? "border-red-300" : "border-amber-300"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 flex items-center gap-2">
                  <span>{a.floorName ?? "Unknown floor"} — {a.zoneName ?? "Unassigned zone"}</span>
                  {offlineHangerIds.has(a.hangerId) && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-400"
                      title="The hanger that reported this alert hasn't phoned home recently — assume it's offline"
                    >
                      HANGER OFFLINE
                    </span>
                  )}
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
              <AlertFloorPlanThumb floorId={a.floorId} alertedZoneId={a.zoneId} status={a.status} />
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-semibold mt-10 mb-3">All floor plans</h2>
      <p className="text-sm text-slate-500 mb-3">
        Live view of every floor with a plan uploaded. Pins: <span className="text-red-600">red</span> = active alert,
        <span className="text-blue-600"> blue</span> = cleaning in progress, <span className="text-green-600">green</span> = idle.
      </p>
      <SiteFloorPlansOverview />

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
