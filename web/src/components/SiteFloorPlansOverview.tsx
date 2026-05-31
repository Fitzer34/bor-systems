import { useQuery } from "@tanstack/react-query";
import { api, API_BASE } from "../lib/api";
import { useTicker } from "../lib/ticker";

interface ActiveAlert {
  id: string;
  status: "open" | "acknowledged" | "closed";
  zoneId: string | null;
}
interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }
interface Hanger { id: string; zoneId: string | null; status: "active" | "out_of_service" | "decommissioned"; lastSeenAt: string | null }

interface FloorWithZones {
  building: Building;
  floor: Floor;
  zones: Zone[];
}

const ONLINE_WINDOW_MS = 15 * 1000;

export function SiteFloorPlansOverview() {
  // Re-render every second so offline pins appear the moment a hanger
  // crosses the 15-second silence threshold.
  useTicker(1000);

  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
  });

  const allFloors = useQuery({
    queryKey: ["all-site-floors", buildings.data?.buildings.map((b) => b.id)],
    enabled: !!buildings.data,
    queryFn: async () => {
      const out: FloorWithZones[] = [];
      for (const b of buildings.data!.buildings) {
        const fs = await api<{ floors: Floor[] }>(`/buildings/${b.id}/floors`);
        const sorted = [...fs.floors].sort((x, y) => x.orderIndex - y.orderIndex);
        for (const f of sorted) {
          if (!f.floorPlanUrl) continue;
          const zs = await api<{ zones: Zone[] }>(`/floors/${f.id}/zones`);
          out.push({ building: b, floor: f, zones: zs.zones });
        }
      }
      return out;
    },
    // Pick up newly-uploaded floor plans or reordered floors within ~15s
    // without needing a page refresh.
    refetchInterval: 15_000,
  });

  const alerts = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 3_000,
  });
  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 5_000,
  });

  const statusByZoneId = new Map<string, "open" | "acknowledged">();
  for (const a of alerts.data?.alerts ?? []) {
    if (a.zoneId && a.status !== "closed") statusByZoneId.set(a.zoneId, a.status);
  }

  // A zone is "offline" when it has active hangers but none have phoned home
  // recently. Lifecycle states (decommissioned/out-of-service) don't count.
  const offlineZoneIds = new Set<string>();
  {
    const now = Date.now();
    const byZone = new Map<string, Hanger[]>();
    for (const h of hangers.data?.hangers ?? []) {
      if (!h.zoneId || h.status !== "active") continue;
      const list = byZone.get(h.zoneId) ?? [];
      list.push(h);
      byZone.set(h.zoneId, list);
    }
    for (const [zoneId, hs] of byZone.entries()) {
      const fresh = hs.some((h) => h.lastSeenAt != null && now - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS);
      if (!fresh) offlineZoneIds.add(zoneId);
    }
  }

  const items = allFloors.data ?? [];
  if (allFloors.isLoading) {
    return <div className="text-sm text-slate-500">Loading floor plans…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
        No floor plans uploaded yet. An admin can upload them on the Floor plans page.
      </div>
    );
  }

  return (
    // Single column so each plan is large and easy to scan. Floors are
    // sorted by orderIndex (set via the Floor plans admin page).
    <div className="flex flex-col gap-4">
      {items.map((it) => (
        <FloorPlanCard
          key={it.floor.id}
          item={it}
          statusByZoneId={statusByZoneId}
          offlineZoneIds={offlineZoneIds}
        />
      ))}
    </div>
  );
}

function FloorPlanCard({
  item,
  statusByZoneId,
  offlineZoneIds,
}: {
  item: FloorWithZones;
  statusByZoneId: Map<string, "open" | "acknowledged">;
  offlineZoneIds: Set<string>;
}) {
  const planUrl = item.floor.floorPlanUrl!;
  const pinned = item.zones.filter((z) => z.pinX != null && z.pinY != null);
  const alertedHere = pinned.filter((z) => statusByZoneId.has(z.id));
  const offlineHere = pinned.filter((z) => offlineZoneIds.has(z.id) && !statusByZoneId.has(z.id));
  const hasOpen = alertedHere.some((z) => statusByZoneId.get(z.id) === "open");
  const hasAck = alertedHere.some((z) => statusByZoneId.get(z.id) === "acknowledged");

  return (
    <div
      className={`bg-slate-900/50 border rounded-lg overflow-hidden shadow-sm ${
        hasOpen ? "border-red-300" : hasAck ? "border-blue-300" : "border-slate-700"
      }`}
    >
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium truncate">{item.floor.name}</div>
          <div className="text-xs text-slate-500 truncate">{item.building.name}</div>
        </div>
        <div className="text-xs text-slate-500 shrink-0 flex items-center gap-2">
          {alertedHere.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
              {alertedHere.length} active
            </span>
          )}
          {offlineHere.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium">
              {offlineHere.length} offline
            </span>
          )}
          <span>{pinned.length} zone{pinned.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="relative">
        <img src={planUrl} alt="" className="block w-full h-auto" />
        {pinned.map((z) => {
          const s = statusByZoneId.get(z.id);
          const isOffline = !s && offlineZoneIds.has(z.id);

          // Alert state always wins — a zone with an open alert showing as
          // offline would bury the more urgent signal.
          if (s) {
            const color = s === "open" ? "bg-red-500" : "bg-blue-500";
            return (
              <div
                key={z.id}
                title={`${z.name}${s === "open" ? " — ALERT" : " — cleaning in progress"}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-2 ring-white animate-pulse w-4 h-4 ${color}`}
                style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
              />
            );
          }
          if (isOffline) {
            return (
              <div
                key={z.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
              >
                <div
                  title={`${z.name} — hanger offline`}
                  className="rounded-full shadow ring-1 ring-white border border-dashed border-amber-700 bg-amber-400 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold text-amber-900 leading-none"
                >
                  ?
                </div>
                <span className="absolute left-full ml-1 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wide text-amber-700 bg-slate-900/80 px-1 rounded whitespace-nowrap">
                  offline
                </span>
              </div>
            );
          }
          return (
            <div
              key={z.id}
              title={z.name}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-1 ring-white bg-green-500 w-2.5 h-2.5"
              style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
