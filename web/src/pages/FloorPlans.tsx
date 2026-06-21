import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getToken, apiUrl, API_BASE } from "../lib/api";
import { useTicker } from "../lib/ticker";
import {
  SensorPin,
  sensorState,
  sensorStateLabel,
  isLowBattery,
  type SensorState,
} from "../components/SensorPin";
import { SensorDetailPopover } from "../components/SensorDetailPopover";

interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }
interface ActiveAlert { id: string; hangerId: string; zoneId: string | null; status: "open" | "acknowledged" | "closed" }
interface Hanger {
  id: string;
  devEui: string;
  name: string | null;
  zoneId: string | null;
  status: "active" | "out_of_service" | "decommissioned";
  batteryPct: number | null;
  lastSeenAt: string | null;
  lastLiftedAt: string | null;
  signal: number | null;
  rssi: number | null;
  reportsViaGatewayId: string | null;
  reportsViaGatewayName: string | null;
}
interface Gateway {
  id: string;
  name: string | null;
  buildingId: string | null;
  rssi: number | null;
  lastSeenAt: string | null;
}

// A hanger placed on the plan: its zone's pin coords plus a small fan-out
// offset so several hangers sharing one zone don't stack on the same point.
interface PlacedSensor {
  hanger: Hanger;
  zone: Zone;
  x: number; // 0–1000 plan coords (already fanned out)
  y: number;
}

// Gateways are "online" on a tighter window (they're mains/Wi-Fi, not battery).
const GATEWAY_ONLINE_WINDOW_MS = 90 * 1000;

export function FloorPlans() {
  useTicker(1000);
  const qc = useQueryClient();
  // Deep-link support: Sites overview links here as /floor-plans?building=<id>.
  const [searchParams] = useSearchParams();
  const requestedBuilding = searchParams.get("building");

  // ── View vs edit ──
  // Default is a clean monitoring view: pick a building + floor, see the plan
  // with live pins. The Edit toggle reveals all the setup controls
  // (add/rename/reorder buildings·floors·zones, upload plan, place pins).
  const [editMode, setEditMode] = useState(false);

  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState("");
  const [floorName, setFloorName] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [pinningZoneId, setPinningZoneId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // The one piece of state that links the plan and the side list: which sensor
  // is selected. Clicking a pin or a row sets it; it highlights the pin, the
  // row, and opens the detail popover.
  const [selectedHangerId, setSelectedHangerId] = useState<string | null>(null);

  const buildings = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const floors = useQuery({
    queryKey: ["floors", activeBuildingId],
    enabled: !!activeBuildingId,
    queryFn: () => api<{ floors: Floor[] }>(`/buildings/${activeBuildingId}/floors`),
  });
  const zones = useQuery({
    queryKey: ["zones", activeFloorId],
    enabled: !!activeFloorId,
    queryFn: () => api<{ zones: Zone[] }>(`/floors/${activeFloorId}/zones`),
  });
  const activeAlerts = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });
  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 5_000,
  });
  const gateways = useQuery({
    queryKey: ["gateways"],
    queryFn: () => api<{ gateways: Gateway[] }>("/gateways"),
    refetchInterval: 10_000,
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ lowBatteryThreshold: number }>("/settings"),
  });
  const lowBatteryThreshold = settings.data?.lowBatteryThreshold ?? 20;

  // If the ?building=<id> param changes after mount — e.g. navigating here a
  // second time from Sites overview without a remount — switch to it and reset
  // the floor so the new building's first floor is shown.
  useEffect(() => {
    if (!requestedBuilding) return;
    const exists = (buildings.data?.buildings ?? []).some((b) => b.id === requestedBuilding);
    if (exists && requestedBuilding !== activeBuildingId) {
      setActiveBuildingId(requestedBuilding);
      setActiveFloorId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedBuilding, buildings.data]);

  // Auto-select the first building (and its first floor) so the page isn't
  // blank on arrival — the most common case is one building.
  const buildingList = buildings.data?.buildings ?? [];
  const firstBuilding = buildingList[0];
  if (!activeBuildingId && firstBuilding) {
    // setState during render is fine for this one-shot default (React bails
    // out of the extra render once the value stops changing). Honour a
    // ?building=<id> deep-link from Sites overview; otherwise default to the
    // first building.
    const wanted = requestedBuilding && buildingList.some((b) => b.id === requestedBuilding)
      ? requestedBuilding
      : firstBuilding.id;
    setActiveBuildingId(wanted);
  }

  const sortedFloors = [...(floors.data?.floors ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const firstFloor = sortedFloors[0];
  if (!activeFloorId && firstFloor) {
    setActiveFloorId(firstFloor.id);
  }

  // ── Alert lookup by hanger ──
  // /alerts/active carries hangerId, so we can attach the live alert (and its
  // /alerts/:id link) to each sensor pin directly.
  const alertByHangerId = new Map<string, { id: string; status: "open" | "acknowledged" }>();
  for (const a of activeAlerts.data?.alerts ?? []) {
    if (a.status === "open" || a.status === "acknowledged") {
      alertByHangerId.set(a.hangerId, { id: a.id, status: a.status });
    }
  }

  // ── Derive per-hanger sensor pins for the active floor ──
  // Join hangers → zones (only zones on this floor), drop each at its zone's
  // pin coords, and fan out multiple hangers in one zone around that point so
  // they don't overlap. Zone position is an interim stand-in until hangers get
  // their own coordinates.
  const now = Date.now();
  const zonesOnFloor = zones.data?.zones ?? [];
  const zoneById = new Map(zonesOnFloor.map((z) => [z.id, z]));
  const allHangers = hangers.data?.hangers ?? [];

  // Group this floor's pinned-zone hangers by zone so we can fan them out.
  const hangersByZone = new Map<string, Hanger[]>();
  for (const h of allHangers) {
    if (!h.zoneId) continue;
    const z = zoneById.get(h.zoneId);
    if (!z || z.pinX == null || z.pinY == null) continue;
    const list = hangersByZone.get(h.zoneId) ?? [];
    list.push(h);
    hangersByZone.set(h.zoneId, list);
  }

  const placedSensors: PlacedSensor[] = [];
  for (const [zoneId, hs] of hangersByZone.entries()) {
    const z = zoneById.get(zoneId)!;
    // Stable order so the fan-out doesn't jiggle between renders.
    const ordered = [...hs].sort((a, b) => a.id.localeCompare(b.id));
    const n = ordered.length;
    ordered.forEach((h, i) => {
      let x = z.pinX!;
      let y = z.pinY!;
      if (n > 1) {
        // Spread around the zone point on a small circle (radius in plan units,
        // ~2.2% of the plan). Keeps them readable without drifting off-zone.
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const r = 22;
        x = Math.max(0, Math.min(1000, z.pinX! + Math.cos(angle) * r));
        y = Math.max(0, Math.min(1000, z.pinY! + Math.sin(angle) * r));
      }
      placedSensors.push({ hanger: h, zone: z, x, y });
    });
  }
  placedSensors.sort((a, b) =>
    (a.zone.name + a.hanger.id).localeCompare(b.zone.name + b.hanger.id),
  );

  const stateOf = (h: Hanger): SensorState =>
    sensorState(h, alertByHangerId.get(h.id)?.status, now);

  // Counts for the legend.
  const counts = { alert: 0, cleaning: 0, offline: 0, ok: 0 } as Record<SensorState, number>;
  for (const p of placedSensors) counts[stateOf(p.hanger)] += 1;

  // ── Gateways for this building ──
  // Gateways have no floor coordinates, so they appear in the side list + the
  // legend count only — we don't guess positions on the plan.
  const buildingGateways = (gateways.data?.gateways ?? []).filter(
    (g) => g.buildingId === activeBuildingId,
  );
  // "hears N hangers": hangers in this building that report via this gateway.
  const hangerCountByGateway = new Map<string, number>();
  for (const h of allHangers) {
    if (h.reportsViaGatewayId) {
      hangerCountByGateway.set(
        h.reportsViaGatewayId,
        (hangerCountByGateway.get(h.reportsViaGatewayId) ?? 0) + 1,
      );
    }
  }
  const gatewayOnline = (g: Gateway): boolean =>
    g.lastSeenAt != null && now - new Date(g.lastSeenAt).getTime() <= GATEWAY_ONLINE_WINDOW_MS;

  // The selected sensor (if it's on this floor) for the popover.
  const selectedPlaced = placedSensors.find((p) => p.hanger.id === selectedHangerId) ?? null;

  // ── Mutations ──
  const createBuilding = useMutation({
    mutationFn: () => api("/buildings", { method: "POST", body: JSON.stringify({ name: buildingName }) }),
    onSuccess: () => { setBuildingName(""); qc.invalidateQueries({ queryKey: ["buildings"] }); },
  });
  const createFloor = useMutation({
    mutationFn: () => api(`/buildings/${activeBuildingId}/floors`, {
      method: "POST",
      body: JSON.stringify({ name: floorName, orderIndex: (floors.data?.floors.length ?? 0) + 1 }),
    }),
    onSuccess: () => { setFloorName(""); qc.invalidateQueries({ queryKey: ["floors", activeBuildingId] }); },
  });
  const createZone = useMutation({
    mutationFn: () => api(`/floors/${activeFloorId}/zones`, { method: "POST", body: JSON.stringify({ name: zoneName }) }),
    onSuccess: () => { setZoneName(""); qc.invalidateQueries({ queryKey: ["zones", activeFloorId] }); },
  });
  const deleteZone = useMutation({
    mutationFn: (zoneId: string) => api(`/zones/${zoneId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zones", activeFloorId] }),
  });
  const updateZonePin = useMutation({
    mutationFn: (z: { id: string; pinX: number; pinY: number }) =>
      api(`/zones/${z.id}`, { method: "PATCH", body: JSON.stringify({ pinX: z.pinX, pinY: z.pinY }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zones", activeFloorId] }),
  });
  const swapFloors = useMutation({
    mutationFn: async (args: { a: Floor; b: Floor }) => {
      await api(`/floors/${args.a.id}`, { method: "PATCH", body: JSON.stringify({ orderIndex: args.b.orderIndex }) });
      await api(`/floors/${args.b.id}`, { method: "PATCH", body: JSON.stringify({ orderIndex: args.a.orderIndex }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["floors", activeBuildingId] });
      qc.invalidateQueries({ queryKey: ["all-site-floors"] });
    },
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPlan = useMutation({
    mutationFn: async (file: File) => {
      // Validate client-side so the user gets an instant, clear reason
      // instead of a silent backend rejection.
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        throw new Error("Please choose a PNG or JPEG image.");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("Image is too large (max 8 MB). Try a smaller export.");
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(apiUrl(`/floors/${activeFloorId}/floor-plan`), {
        method: "POST",
        headers: { authorization: `Bearer ${getToken() ?? ""}` },
        body: fd,
      });
      if (!res.ok) {
        let msg = `Upload failed (${res.status}).`;
        try { const b = await res.json(); if (b?.error) msg = `Upload failed: ${b.error}`; } catch { /* ignore */ }
        throw new Error(msg);
      }
      return res.json();
    },
    onMutate: () => setUploadError(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["floors", activeBuildingId] }),
    onError: (e: unknown) => setUploadError(e instanceof Error ? e.message : "Upload failed."),
  });

  const handleFile = (f: File | undefined | null) => { if (f) uploadPlan.mutate(f); };

  const activeFloor = floors.data?.floors.find((f) => f.id === activeFloorId);

  const planSrc = (url: string): string => (url.startsWith("http") ? url : `${API_BASE}${url}`);

  const handlePlanClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pinningZoneId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    updateZonePin.mutate({ id: pinningZoneId, pinX: x, pinY: y });
    setPinningZoneId(null);
  };

  const pinnedZones = zonesOnFloor.filter((z) => z.pinX != null && z.pinY != null);
  const unpinnedZones = zonesOnFloor.filter((z) => z.pinX == null || z.pinY == null);

  // When switching floor, drop a selection that's no longer on the plan.
  useEffect(() => { setSelectedHangerId(null); }, [activeFloorId]);

  return (
    <div className="max-w-6xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold">Floor plans</h1>
        <button
          onClick={() => { setEditMode((v) => !v); setPinningZoneId(null); }}
          className={editMode ? "btn-primary" : "btn-secondary"}
        >
          {editMode ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              Done editing
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
              Edit
            </>
          )}
        </button>
      </div>

      {/* ── Building + floor selectors (always visible) ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[180px]">
          <label className="field-label">Building</label>
          <select
            value={activeBuildingId ?? ""}
            onChange={(e) => { setActiveBuildingId(e.target.value || null); setActiveFloorId(null); }}
            className="w-full px-3 py-2 text-sm rounded-lg"
          >
            <option value="">— Select building —</option>
            {buildingList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="field-label">Floor</label>
          <select
            value={activeFloorId ?? ""}
            onChange={(e) => setActiveFloorId(e.target.value || null)}
            disabled={!activeBuildingId}
            className="w-full px-3 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            <option value="">— Select floor —</option>
            {sortedFloors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {/* ── EDIT PANEL ── */}
      {editMode && (
        <div className="card mb-5 space-y-5">
          {/* Buildings */}
          <div>
            <div className="section-title">Buildings</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {buildingList.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setActiveBuildingId(b.id); setActiveFloorId(null); }}
                  className={"px-3 py-1.5 text-sm rounded-lg font-medium transition " + (activeBuildingId === b.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200")}
                >{b.name}</button>
              ))}
            </div>
            <div className="flex gap-2 max-w-md">
              <input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="New building name" className="input flex-1" />
              <button onClick={() => createBuilding.mutate()} disabled={!buildingName.trim() || createBuilding.isPending} className="btn-primary">
                {createBuilding.isPending ? "…" : "Add"}
              </button>
            </div>
          </div>

          {/* Floors */}
          {activeBuildingId && (
            <div>
              <div className="section-title">Floors <span className="normal-case text-slate-500">— drag order sets the dashboard order</span></div>
              <div className="space-y-1 mb-2">
                {sortedFloors.map((f, idx) => {
                  const above = idx > 0 ? sortedFloors[idx - 1] : null;
                  const below = idx < sortedFloors.length - 1 ? sortedFloors[idx + 1] : null;
                  return (
                    <div key={f.id} className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveFloorId(f.id)}
                        className={"flex-1 text-left px-3 py-1.5 text-sm rounded-lg font-medium transition " + (activeFloorId === f.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200")}
                      >
                        {f.name}
                        {f.floorPlanUrl
                          ? <span className={"ml-2 inline-flex items-center gap-1 text-xs " + (activeFloorId === f.id ? "text-white/80" : "text-emerald-700")}><span className="h-1.5 w-1.5 rounded-full bg-current" />plan</span>
                          : <span className={"ml-2 inline-flex items-center gap-1 text-xs " + (activeFloorId === f.id ? "text-white/70" : "text-slate-500")}><span className="h-1.5 w-1.5 rounded-full border border-current" />no plan</span>}
                      </button>
                      <button onClick={() => above && swapFloors.mutate({ a: f, b: above })} disabled={!above || swapFloors.isPending} title="Move up" className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
                      </button>
                      <button onClick={() => below && swapFloors.mutate({ a: f, b: below })} disabled={!below || swapFloors.isPending} title="Move down" className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 max-w-md">
                <input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="New floor name (e.g. Ground)" className="input flex-1" />
                <button onClick={() => createFloor.mutate()} disabled={!floorName.trim() || createFloor.isPending} className="btn-primary">
                  {createFloor.isPending ? "…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {/* Zones */}
          {activeFloorId && (
            <div>
              <div className="section-title">Zones</div>
              {(zones.data?.zones.length ?? 0) > 0 && (
                <div className="space-y-1 mb-2">
                  {zones.data?.zones.map((z) => (
                    <div key={z.id} className="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-1.5 text-sm">
                      <span className="inline-flex items-center">
                        {z.name}
                        {z.pinX != null
                          ? <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-current" />pinned</span>
                          : <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700"><span className="h-1.5 w-1.5 rounded-full border border-current" />needs pin</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        {activeFloor?.floorPlanUrl && (
                          <button
                            onClick={() => setPinningZoneId(pinningZoneId === z.id ? null : z.id)}
                            className={"text-xs " + (pinningZoneId === z.id ? "text-amber-700 font-medium" : "text-blue-700 hover:underline")}
                          >
                            {pinningZoneId === z.id ? "click on the plan ↓" : (z.pinX != null ? "move pin" : "place pin")}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete the "${z.name}" zone? Any hanger in it becomes unassigned.`)) {
                              if (pinningZoneId === z.id) setPinningZoneId(null);
                              deleteZone.mutate(z.id);
                            }
                          }}
                          disabled={deleteZone.isPending}
                          title="Delete zone"
                          aria-label="Delete zone"
                          className="text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 max-w-md">
                <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="New zone (e.g. Toilet, Reception)" className="input flex-1" />
                <button onClick={() => createZone.mutate()} disabled={!zoneName.trim() || createZone.isPending} className="btn-primary">
                  {createZone.isPending ? "…" : "Add"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PLAN AREA ── */}
      {!activeBuildingId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {buildingList.length === 0
            ? <>No buildings yet. Tap <span className="text-slate-800 font-medium">Edit</span> to add your first building, floor, and zones.</>
            : "Select a building above to view its floor plans."}
        </div>
      ) : !activeFloorId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {sortedFloors.length === 0
            ? <>No floors in this building yet. Tap <span className="text-slate-800 font-medium">Edit</span> to add one.</>
            : "Select a floor above."}
        </div>
      ) : (
        // Plan (centrepiece) on the left, linked sensor list on the right.
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">{activeFloor?.name}</div>
              {editMode && (
                <button onClick={() => fileInput.current?.click()} disabled={uploadPlan.isPending} className="btn-primary">
                  {uploadPlan.isPending ? "Uploading…" : (activeFloor?.floorPlanUrl ? "Replace plan" : "Upload plan")}
                </button>
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {uploadError && (
              <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {uploadError}
              </div>
            )}

            {activeFloor?.floorPlanUrl ? (
              <>
                {pinningZoneId && (
                  <div className="mb-2 text-sm text-amber-700">
                    Click where the zone sits on the plan to drop its pin.
                  </div>
                )}
                <div
                  onClick={handlePlanClick}
                  className={"relative inline-block rounded overflow-hidden " + (pinningZoneId ? "cursor-crosshair ring-2 ring-amber-400" : "")}
                >
                  <img src={planSrc(activeFloor.floorPlanUrl)} alt="" className="block max-w-full max-h-[640px]" />

                  {/* Sensor pins (one per hanger) */}
                  {placedSensors.map((p) => (
                    <SensorPin
                      key={p.hanger.id}
                      state={stateOf(p.hanger)}
                      label={p.hanger.name || p.hanger.id}
                      lowBattery={isLowBattery(p.hanger.batteryPct, lowBatteryThreshold)}
                      selected={selectedHangerId === p.hanger.id}
                      onClick={(e) => {
                        // Don't trigger the plan's pin-placement click.
                        e.stopPropagation();
                        if (pinningZoneId) return;
                        setSelectedHangerId((cur) => (cur === p.hanger.id ? null : p.hanger.id));
                      }}
                      style={{ left: `${(p.x / 1000) * 100}%`, top: `${(p.y / 1000) * 100}%` }}
                    />
                  ))}

                  {/* Anchored detail popover for the selected sensor */}
                  {selectedPlaced && (
                    <SensorDetailPopover
                      hanger={selectedPlaced.hanger}
                      zoneName={selectedPlaced.zone.name}
                      activeAlertId={alertByHangerId.get(selectedPlaced.hanger.id)?.id ?? null}
                      alertStatus={alertByHangerId.get(selectedPlaced.hanger.id)?.status}
                      lowBatteryThreshold={lowBatteryThreshold}
                      onClose={() => setSelectedHangerId(null)}
                      // Anchor near the pin; translate up-left so it doesn't
                      // cover the marker, and clamp within the plan via max-w.
                      style={{
                        position: "absolute",
                        left: `${(selectedPlaced.x / 1000) * 100}%`,
                        top: `${(selectedPlaced.y / 1000) * 100}%`,
                        transform: "translate(-50%, 14px)",
                      }}
                    />
                  )}
                </div>

                {editMode && unpinnedZones.length > 0 && (
                  <div className="mt-3 text-sm text-amber-700">
                    {unpinnedZones.length} zone{unpinnedZones.length === 1 ? "" : "s"} still need a pin: use "place pin" above.
                  </div>
                )}

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                  <LegendDot className="bg-green-500" label={`On rack ${counts.ok}`} />
                  <LegendDot className="bg-red-500" label={`Lifted ${counts.alert}`} />
                  <LegendDot className="bg-blue-500" label={`Cleaning ${counts.cleaning}`} />
                  <LegendDot className="bg-amber-400" label={`Offline ${counts.offline}`} />
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[3px] bg-slate-700 inline-block" /> Gateways {buildingGateways.length}
                  </span>
                </div>
              </>
            ) : editMode ? (
              // Drag-and-drop upload target (edit mode, no plan yet)
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileInput.current?.click()}
                className={"cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition " +
                  (dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400")}
              >
                <div className="text-slate-600 font-medium">Drop a floor-plan image here</div>
                <div className="text-sm text-slate-500 mt-1">or click to choose a file · PNG or JPEG · up to 8 MB</div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                No plan uploaded for this floor yet. Tap <span className="text-slate-800 font-medium">Edit</span> to upload one.
              </div>
            )}
          </div>

          {/* ── Linked side list ── */}
          <SensorSideList
            placedSensors={placedSensors}
            stateOf={stateOf}
            lowBatteryThreshold={lowBatteryThreshold}
            alertByHangerId={alertByHangerId}
            selectedHangerId={selectedHangerId}
            onSelect={(id) => setSelectedHangerId((cur) => (cur === id ? null : id))}
            gateways={buildingGateways}
            gatewayOnline={gatewayOnline}
            hangerCountByGateway={hangerCountByGateway}
          />
        </div>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={"w-3 h-3 rounded-full inline-block " + className} /> {label}
    </span>
  );
}

function signalLabel(rssi: number): string {
  if (rssi >= -45) return "excellent";
  if (rssi >= -55) return "strong";
  if (rssi >= -65) return "good";
  if (rssi >= -75) return "weak";
  return "very weak";
}

function SensorSideList({
  placedSensors,
  stateOf,
  lowBatteryThreshold,
  alertByHangerId,
  selectedHangerId,
  onSelect,
  gateways,
  gatewayOnline,
  hangerCountByGateway,
}: {
  placedSensors: PlacedSensor[];
  stateOf: (h: Hanger) => SensorState;
  lowBatteryThreshold: number;
  alertByHangerId: Map<string, { id: string; status: "open" | "acknowledged" }>;
  selectedHangerId: string | null;
  onSelect: (id: string) => void;
  gateways: Gateway[];
  gatewayOnline: (g: Gateway) => boolean;
  hangerCountByGateway: Map<string, number>;
}) {
  return (
    <div className="card lg:sticky lg:top-4">
      <div className="section-title">Sensors on this floor</div>
      {placedSensors.length === 0 ? (
        <p className="text-sm text-slate-500">
          No placed sensors. Assign hangers to pinned zones to see them here.
        </p>
      ) : (
        <ul className="space-y-1 -mx-1">
          {placedSensors.map((p) => {
            const st = stateOf(p.hanger);
            const low = isLowBattery(p.hanger.batteryPct, lowBatteryThreshold);
            const selected = selectedHangerId === p.hanger.id;
            const dotClass =
              st === "alert" ? "bg-red-500" :
              st === "cleaning" ? "bg-blue-500" :
              st === "offline" ? "bg-amber-400" : "bg-green-500";
            return (
              <li key={p.hanger.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.hanger.id)}
                  className={"w-full text-left rounded-lg px-2 py-1.5 flex items-center gap-2 transition " +
                    (selected ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-50")}
                >
                  <span className={"h-2.5 w-2.5 rounded-full shrink-0 " + dotClass + (st === "alert" || st === "cleaning" ? " animate-pulse" : "")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{p.hanger.name || "Wet-floor sign"}</span>
                    <span className="block text-xs text-slate-500 truncate">{p.zone.name} · {sensorStateLabel(st)}</span>
                  </span>
                  {low && (
                    <span title="Low battery" aria-label="Low battery" className="shrink-0 text-amber-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="8" width="14" height="8" rx="1.5" /><path d="M19 11 L19 13" />
                      </svg>
                    </span>
                  )}
                  {alertByHangerId.has(p.hanger.id) && (
                    <span className={"shrink-0 " + (alertByHangerId.get(p.hanger.id)!.status === "open" ? "text-red-600" : "text-blue-600")}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Gateways group — side-list + legend only (no floor coordinates). */}
      <div className="section-title mt-5">Gateways</div>
      {gateways.length === 0 ? (
        <p className="text-sm text-slate-500">No gateways in this building.</p>
      ) : (
        <ul className="space-y-1 -mx-1">
          {gateways.map((g) => {
            const online = gatewayOnline(g);
            const hears = hangerCountByGateway.get(g.id) ?? 0;
            return (
              <li key={g.id} className="rounded-lg px-2 py-1.5 flex items-center gap-2">
                <span className={"h-2.5 w-2.5 rounded-[3px] shrink-0 " + (online ? "bg-slate-700" : "bg-amber-400")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{g.name || "Gateway"}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {online ? "Online" : "Offline"}
                    {hears > 0 ? ` · hears ${hears} hanger${hears === 1 ? "" : "s"}` : ""}
                    {g.rssi != null ? ` · ${g.rssi} dBm (${signalLabel(g.rssi)})` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
