import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AlertFloorPlanThumb } from "../components/AlertFloorPlanThumb";
import { SiteFloorPlansOverview } from "../components/SiteFloorPlansOverview";
import { useTicker } from "../lib/ticker";
import { PpmReminderBanner, PpmDueList } from "./Ppms";

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
  name: string | null;
  status: "active" | "out_of_service" | "decommissioned";
  lastSeenAt: string | null;
  batteryPct: number | null;
}

// Battery LoRa hangers deep-sleep and send a "still alive" check-in once a DAY
// (spill alerts are instant + separate). "online" tolerates a missed daily
// beat: 26 h = one daily check-in + 2 h margin. A lift event also refreshes
// lastSeenAt, so the hanger reporting an active spill always reads online.
const ONLINE_WINDOW_MS = 26 * 60 * 60 * 1000;

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

  // Low-battery threshold comes from org settings (staff-only endpoint);
  // everyone else falls back to the same 20% default the rest of the app uses.
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ lowBatteryThreshold: number }>("/settings"),
    enabled: isStaff,
  });
  const lowBatteryThreshold = settings.data?.lowBatteryThreshold ?? 20;

  const offlineHangerIds = new Set<string>();
  const now = Date.now();
  for (const h of hangers.data?.hangers ?? []) {
    if (h.status !== "active") continue;
    const fresh = h.lastSeenAt != null && now - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
    if (!fresh) offlineHangerIds.add(h.id);
  }

  // Active hangers whose battery is at/under the low threshold — surfaced as a
  // banner so a dying hanger is noticed before it goes silent mid-spill.
  const lowBatteryHangers = (hangers.data?.hangers ?? []).filter(
    (h) => h.status === "active" && h.batteryPct != null && h.batteryPct <= lowBatteryThreshold,
  );

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

  const spillAlerts = alerts.data?.alerts.filter((a) => a.kind === "spill") ?? [];

  return (
    <div>
      <PpmReminderBanner />
      {lowBatteryHangers.length > 0 && (
        <LowBatteryBanner hangers={lowBatteryHangers} isStaff={isStaff} />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Active alerts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live spill alerts and your dispatches.</p>
        </div>
        <button onClick={() => alerts.refetch()} className="btn-ghost">Refresh</button>
      </div>
      {alerts.isLoading && <div className="text-slate-500">Loading…</div>}
      {alerts.error && <div className="text-red-600">Could not load alerts.</div>}
      {/* Planned-cleaning sessions are blue pins on the map only — not list entries. */}
      {alerts.data && spillAlerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-slate-900 font-medium">No active spill alerts</div>
          <div className="text-slate-500 text-sm mt-1">You're all clear — live alerts will appear here.</div>
        </div>
      )}
      <ul className="space-y-3">
        {spillAlerts.map((a) => (
          <li key={a.id}>
            <Link
              to={`/alerts/${a.id}`}
              className={`flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                a.status === "open" ? "border-red-300" : "border-amber-300"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>{a.floorName ?? "Unknown floor"} — {a.zoneName ?? "Unassigned zone"}</span>
                  {offlineHangerIds.has(a.hangerId) && (
                    <span
                      className="pill-offline"
                      title="The hanger that reported this alert hasn't phoned home recently — assume it's offline"
                    >
                      Hanger offline
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Lifted {timeAgo(a.openedAt)} · Status: {a.status}
                </div>
              </div>
              <span className={a.status === "open" ? "pill-alert" : "pill-offline"}>
                {a.status === "open" ? "Unacknowledged" : "In progress"}
              </span>
              <AlertFloorPlanThumb floorId={a.floorId} alertedZoneId={a.zoneId} status={a.status} />
            </Link>
          </li>
        ))}
      </ul>

      <PpmDueList />

      <h2 className="text-2xl font-semibold mt-10 mb-3">All floor plans</h2>
      <p className="text-sm text-slate-500 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Live view of every floor with a plan uploaded. Pins:</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> active alert</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> cleaning in progress</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> idle</span>
      </p>
      <SiteFloorPlansOverview />

      {activeDispatches.length > 0 && (
        <>
          <h2 className="text-2xl font-semibold mt-10 mb-3">Dispatches</h2>
          <ul className="space-y-3">
            {activeDispatches.map((d) => (
              <li key={d.id} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {d.zoneName ? `Go to: ${d.zoneName}` : "Dispatch"}
                    </div>
                    <p className="text-slate-600 mt-1 whitespace-pre-wrap break-words">{d.message}</p>
                    <div className="text-xs text-slate-500 mt-2">
                      Sent {timeAgo(d.sentAt)} · Status: {d.status}
                    </div>
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                    {d.status === "sent" && (
                      <button onClick={() => ackDispatch.mutate(d.id)} className="btn-primary flex-1 sm:flex-none">
                        On my way
                      </button>
                    )}
                    {d.status !== "completed" && (
                      <button onClick={() => completeDispatch.mutate(d.id)} className="btn-secondary flex-1 sm:flex-none">
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

function LowBatteryBanner({
  hangers,
  isStaff,
}: {
  hangers: Hanger[];
  isStaff: boolean;
}) {
  const n = hangers.length;
  // Lowest batteries first, show a few inline.
  const sorted = [...hangers].sort((a, b) => (a.batteryPct ?? 0) - (b.batteryPct ?? 0));
  const detail = sorted
    .slice(0, 4)
    .map((h) => `${h.name || "Hanger"} (${h.batteryPct}%)`)
    .join(", ");
  const cls =
    "flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-xl border text-sm bg-amber-50 border-amber-300 text-amber-800";
  const body = (
    <span className="flex items-center gap-2 min-w-0">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
        <rect x="2" y="7" width="16" height="10" rx="2" /><line x1="22" y1="11" x2="22" y2="13" /><line x1="6" y1="12" x2="9" y2="12" />
      </svg>
      <span className="min-w-0">
        <span className="font-medium">{n} hanger{n === 1 ? "" : "s"} low on battery</span>
        <span className="hidden sm:inline text-amber-700/90"> — {detail}{n > 4 ? "…" : ""}</span>
      </span>
    </span>
  );
  return isStaff ? (
    <Link to="/devices" className={cls}>
      {body}
      <span className="shrink-0 text-xs opacity-80">View devices →</span>
    </Link>
  ) : (
    <div className={cls}>{body}</div>
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
