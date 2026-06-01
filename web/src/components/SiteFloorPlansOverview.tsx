import { useState, useRef, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
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

// Battery hangers deep-sleep and check in once a DAY (spill alerts instant +
// separate): 26 h = one daily check-in + 2 h margin.
const ONLINE_WINDOW_MS = 26 * 60 * 60 * 1000;

export function SiteFloorPlansOverview() {
  // Re-render every second so offline pins appear the moment a hanger
  // crosses the silence threshold.
  useTicker(1000);

  // Which building's floors to show. "all" = every building.
  const [selected, setSelected] = useState<string>("all");

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
    // Pick up newly-uploaded floor plans or reordered floors within ~15s.
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

  // Measure the space from the grid's top to the bottom of the viewport so we
  // can size every floor tile to fit on screen — no scrolling. Runs after each
  // render; the 1s ticker keeps it fresh as the alert list above grows/shrinks
  // or the window resizes. The >2px guard prevents a render loop.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = Math.max(window.innerHeight - rect.top - 16, 220);
    const w = el.clientWidth;
    setBox((prev) => (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2 ? { w, h } : prev));
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

  // Buildings that actually have floor plans (for the picker), first-seen order.
  const buildingsWithPlans: Building[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!seen.has(it.building.id)) { seen.add(it.building.id); buildingsWithPlans.push(it.building); }
  }

  // Reset an out-of-range selection (e.g. building lost its last plan).
  const effectiveSelected = selected !== "all" && seen.has(selected) ? selected : "all";
  const visible = effectiveSelected === "all"
    ? items
    : items.filter((it) => it.building.id === effectiveSelected);

  // Auto-scale to fit one screen. Columns come from the measured width (fewer,
  // bigger tiles when there are few floors); each tile's image height is then
  // sized so all rows fit in the measured available height — so a single
  // building's plan fills the frame and you don't scroll through them.
  const n = visible.length;
  const desiredMinCol = n <= 2 ? 300 : 230;
  const cols = box.w > 0
    ? Math.max(1, Math.min(n, Math.floor(box.w / desiredMinCol) || 1))
    : Math.min(Math.max(n, 1), 2);
  const rows = Math.max(1, Math.ceil(n / cols));
  const CARD_CHROME = 58; // card header + image padding per tile (px)
  const ROW_GAP = 12;     // grid row gap (gap-3)
  const tilePx = box.h > 0
    ? Math.max(140, Math.floor((box.h - rows * CARD_CHROME - (rows - 1) * ROW_GAP) / rows))
    : null;
  const imageMaxHeight = tilePx ? `${tilePx}px` : n <= 2 ? "44vh" : n <= 4 ? "32vh" : "24vh";

  return (
    <div>
      {buildingsWithPlans.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <BuildingChip active={effectiveSelected === "all"} onClick={() => setSelected("all")}>
            All buildings
          </BuildingChip>
          {buildingsWithPlans.map((b) => (
            <BuildingChip key={b.id} active={effectiveSelected === b.id} onClick={() => setSelected(b.id)}>
              {b.name}
            </BuildingChip>
          ))}
        </div>
      )}

      <div
        ref={gridRef}
        className="grid gap-3 items-start"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visible.map((it) => (
          <FloorPlanCard
            key={it.floor.id}
            item={it}
            statusByZoneId={statusByZoneId}
            offlineZoneIds={offlineZoneIds}
            imageMaxHeight={imageMaxHeight}
          />
        ))}
      </div>
    </div>
  );
}

function BuildingChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1.5 text-sm rounded-full border transition whitespace-nowrap " +
        (active
          ? "bg-blue-500/15 text-blue-200 border-blue-500/40"
          : "bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800")
      }
    >
      {children}
    </button>
  );
}

function FloorPlanCard({
  item,
  statusByZoneId,
  offlineZoneIds,
  imageMaxHeight,
}: {
  item: FloorWithZones;
  statusByZoneId: Map<string, "open" | "acknowledged">;
  offlineZoneIds: Set<string>;
  imageMaxHeight: string;
}) {
  const planUrl = item.floor.floorPlanUrl!;
  // Track the image's true aspect ratio so the pin overlay box matches the
  // rendered image exactly (a plain max-height would letterbox and misplace
  // the % positioned pins). Default 4:3 until the image loads.
  const [aspect, setAspect] = useState<number>(4 / 3);

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
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate text-sm">{item.floor.name}</div>
          <div className="text-xs text-slate-500 truncate">{item.building.name}</div>
        </div>
        <div className="text-xs text-slate-500 shrink-0 flex items-center gap-1.5">
          {alertedHere.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
              {alertedHere.length} active
            </span>
          )}
          {offlineHere.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium">
              {offlineHere.length} off
            </span>
          )}
          <span>{pinned.length}z</span>
        </div>
      </div>

      {/* Centre the aspect-correct plan in the tile. The wrapper matches the
          image's aspect ratio and is bounded by the column width and the
          shared max height, so all tiles fit without scrolling and pins stay
          pixel-aligned. */}
      <div className="flex justify-center p-1.5">
        <div
          className="relative"
          style={{ aspectRatio: String(aspect), maxHeight: imageMaxHeight, maxWidth: "100%" }}
        >
          <img
            src={planUrl}
            alt=""
            onLoad={(e) => {
              const t = e.currentTarget;
              if (t.naturalWidth > 0 && t.naturalHeight > 0) setAspect(t.naturalWidth / t.naturalHeight);
            }}
            className="block w-full h-full object-contain"
          />
          {pinned.map((z) => {
            const s = statusByZoneId.get(z.id);
            const isOffline = !s && offlineZoneIds.has(z.id);
            const left = `${(z.pinX! / 1000) * 100}%`;
            const top = `${(z.pinY! / 1000) * 100}%`;

            // Alert state always wins — a zone with an open alert showing as
            // offline would bury the more urgent signal.
            if (s) {
              const color = s === "open" ? "bg-red-500" : "bg-blue-500";
              return (
                <div
                  key={z.id}
                  title={`${z.name}${s === "open" ? " — ALERT" : " — cleaning in progress"}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-2 ring-white animate-pulse w-4 h-4 ${color}`}
                  style={{ left, top }}
                />
              );
            }
            if (isOffline) {
              return (
                <div
                  key={z.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left, top }}
                >
                  <div
                    title={`${z.name} — hanger offline`}
                    className="rounded-full shadow ring-1 ring-white border border-dashed border-amber-700 bg-amber-400 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold text-amber-900 leading-none"
                  >
                    ?
                  </div>
                </div>
              );
            }
            return (
              <div
                key={z.id}
                title={z.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-1 ring-white bg-green-500 w-2.5 h-2.5"
                style={{ left, top }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
