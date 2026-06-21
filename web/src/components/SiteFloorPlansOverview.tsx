import { useState, useRef, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useTicker } from "../lib/ticker";
import { SensorPin, sensorState, type SensorState } from "./SensorPin";

interface ActiveAlert {
  id: string;
  hangerId: string;
  status: "open" | "acknowledged" | "closed";
  zoneId: string | null;
}
interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }
interface Hanger {
  id: string;
  zoneId: string | null;
  status: "active" | "out_of_service" | "decommissioned";
  lastSeenAt: string | null;
  batteryPct: number | null;
}

interface FloorWithZones {
  building: Building;
  floor: Floor;
  zones: Zone[];
}

// A hanger dropped on the plan at its zone's coords, with a small fan-out so
// several hangers in one zone don't stack. Mirrors the main FloorPlans page.
interface PlacedSensor {
  hanger: Hanger;
  zone: Zone;
  x: number;
  y: number;
}

// Place a floor's hangers on the plan via their zone's pin, fanning out
// multiple hangers per zone. Shared shape with the main page so the read-only
// mini-maps and the editable page agree on positions.
function placeSensors(zones: Zone[], hangers: Hanger[]): PlacedSensor[] {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const byZone = new Map<string, Hanger[]>();
  for (const h of hangers) {
    if (!h.zoneId) continue;
    const z = zoneById.get(h.zoneId);
    if (!z || z.pinX == null || z.pinY == null) continue;
    const list = byZone.get(h.zoneId) ?? [];
    list.push(h);
    byZone.set(h.zoneId, list);
  }
  const out: PlacedSensor[] = [];
  for (const [zoneId, hs] of byZone.entries()) {
    const z = zoneById.get(zoneId)!;
    const ordered = [...hs].sort((a, b) => a.id.localeCompare(b.id));
    const n = ordered.length;
    ordered.forEach((h, i) => {
      let x = z.pinX!;
      let y = z.pinY!;
      if (n > 1) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const r = 22;
        x = Math.max(0, Math.min(1000, z.pinX! + Math.cos(angle) * r));
        y = Math.max(0, Math.min(1000, z.pinY! + Math.sin(angle) * r));
      }
      out.push({ hanger: h, zone: z, x, y });
    });
  }
  return out;
}

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

  // Active alert per hanger (open/acknowledged) — drives pin state directly.
  const alertByHangerId = new Map<string, "open" | "acknowledged">();
  for (const a of alerts.data?.alerts ?? []) {
    if (a.status === "open" || a.status === "acknowledged") alertByHangerId.set(a.hangerId, a.status);
  }

  const allHangers = hangers.data?.hangers ?? [];

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
            hangers={allHangers}
            alertByHangerId={alertByHangerId}
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
          ? "bg-blue-100 text-blue-800 border-blue-300"
          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-100")
      }
    >
      {children}
    </button>
  );
}

function FloorPlanCard({
  item,
  hangers,
  alertByHangerId,
  imageMaxHeight,
}: {
  item: FloorWithZones;
  hangers: Hanger[];
  alertByHangerId: Map<string, "open" | "acknowledged">;
  imageMaxHeight: string;
}) {
  const planUrl = item.floor.floorPlanUrl!;
  // Track the image's true aspect ratio so the pin overlay box matches the
  // rendered image exactly (a plain max-height would letterbox and misplace
  // the % positioned pins). Default 4:3 until the image loads.
  const [aspect, setAspect] = useState<number>(4 / 3);

  const now = Date.now();
  const placed = placeSensors(item.zones, hangers);
  const stateOf = (h: Hanger): SensorState => sensorState(h, alertByHangerId.get(h.id), now);

  // Tile-level badge counts, derived from the same pin states.
  let alertCount = 0;
  let offlineCount = 0;
  let hasOpen = false;
  let hasAck = false;
  for (const p of placed) {
    const s = stateOf(p.hanger);
    if (s === "alert") { alertCount += 1; hasOpen = true; }
    else if (s === "cleaning") { alertCount += 1; hasAck = true; }
    else if (s === "offline") offlineCount += 1;
  }

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden shadow-sm ${
        hasOpen ? "border-red-300" : hasAck ? "border-blue-300" : "border-slate-300"
      }`}
    >
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate text-sm">{item.floor.name}</div>
          <div className="text-xs text-slate-500 truncate">{item.building.name}</div>
        </div>
        <div className="text-xs text-slate-500 shrink-0 flex items-center gap-1.5">
          {alertCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
              {alertCount} active
            </span>
          )}
          {offlineCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium">
              {offlineCount} off
            </span>
          )}
          <span>{placed.length}s</span>
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
          {placed.map((p) => (
            <SensorPin
              key={p.hanger.id}
              state={stateOf(p.hanger)}
              label={p.zone.name}
              // Read-only mini-map: smaller pins, no badge, not tappable.
              size={14}
              style={{ left: `${(p.x / 1000) * 100}%`, top: `${(p.y / 1000) * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
