import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface ActiveAlert {
  id: string;
  status: "open" | "acknowledged" | "closed";
  zoneId: string | null;
}
interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }

interface FloorWithZones {
  building: Building;
  floor: Floor;
  zones: Zone[];
}

export function SiteFloorPlansOverview() {
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
  });

  const alerts = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });

  const statusByZoneId = new Map<string, "open" | "acknowledged">();
  for (const a of alerts.data?.alerts ?? []) {
    if (a.zoneId && a.status !== "closed") statusByZoneId.set(a.zoneId, a.status);
  }

  const items = allFloors.data ?? [];
  if (allFloors.isLoading) {
    return <div className="text-sm text-slate-500">Loading floor plans…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        No floor plans uploaded yet. An admin can upload them on the Floor plans page.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((it) => (
        <FloorPlanCard
          key={it.floor.id}
          item={it}
          statusByZoneId={statusByZoneId}
        />
      ))}
    </div>
  );
}

function FloorPlanCard({
  item,
  statusByZoneId,
}: {
  item: FloorWithZones;
  statusByZoneId: Map<string, "open" | "acknowledged">;
}) {
  const planUrl = item.floor.floorPlanUrl!;
  const pinned = item.zones.filter((z) => z.pinX != null && z.pinY != null);
  const alertedHere = pinned.filter((z) => statusByZoneId.has(z.id));
  const hasOpen = alertedHere.some((z) => statusByZoneId.get(z.id) === "open");
  const hasAck = alertedHere.some((z) => statusByZoneId.get(z.id) === "acknowledged");

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden shadow-sm ${
        hasOpen ? "border-red-300" : hasAck ? "border-blue-300" : "border-slate-200"
      }`}
    >
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium truncate">{item.floor.name}</div>
          <div className="text-xs text-slate-500 truncate">{item.building.name}</div>
        </div>
        <div className="text-xs text-slate-500 shrink-0">
          {alertedHere.length === 0
            ? `${pinned.length} zone${pinned.length === 1 ? "" : "s"}`
            : `${alertedHere.length} active`}
        </div>
      </div>
      <div className="relative">
        <img src={planUrl} alt="" className="block w-full h-auto" />
        {pinned.map((z) => {
          const s = statusByZoneId.get(z.id);
          const color = s === "open"
            ? "bg-red-500"
            : s === "acknowledged"
              ? "bg-blue-500"
              : "bg-green-500";
          const ring = s ? "ring-2 ring-white" : "ring-1 ring-white";
          const sizeClass = s ? "w-4 h-4" : "w-2.5 h-2.5";
          const animate = s ? "animate-pulse" : "";
          return (
            <div
              key={z.id}
              title={`${z.name}${s === "open" ? " — ALERT" : s === "acknowledged" ? " — cleaning in progress" : ""}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow ${color} ${sizeClass} ${ring} ${animate}`}
              style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
