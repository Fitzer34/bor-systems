import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getToken, apiUrl, API_BASE } from "../lib/api";
import { useTicker } from "../lib/ticker";

interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }
interface ActiveAlert { id: string; zoneId: string | null; status: "open" | "acknowledged" | "closed" }
interface Hanger { id: string; zoneId: string | null; status: "active" | "out_of_service" | "decommissioned"; lastSeenAt: string | null }

// Battery hangers deep-sleep and check in once a DAY (spill alerts instant +
// separate): 26 h = one daily check-in + 2 h margin.
const ONLINE_WINDOW_MS = 26 * 60 * 60 * 1000;

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

  const zoneStatusById = new Map<string, "open" | "acknowledged">();
  for (const a of activeAlerts.data?.alerts ?? []) {
    if (a.zoneId && a.status !== "closed") zoneStatusById.set(a.zoneId, a.status);
  }

  const offlineZoneIds = new Set<string>();
  {
    const now = Date.now();
    const zoneHangers = new Map<string, Hanger[]>();
    for (const h of hangers.data?.hangers ?? []) {
      if (!h.zoneId || h.status !== "active") continue;
      const list = zoneHangers.get(h.zoneId) ?? [];
      list.push(h);
      zoneHangers.set(h.zoneId, list);
    }
    for (const [zoneId, hs] of zoneHangers.entries()) {
      const anyOnline = hs.some((h) => h.lastSeenAt != null && now - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS);
      if (!anyOnline) offlineZoneIds.add(zoneId);
    }
  }

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

  const pinnedZones = (zones.data?.zones ?? []).filter((z) => z.pinX != null && z.pinY != null);
  const unpinnedZones = (zones.data?.zones ?? []).filter((z) => z.pinX == null || z.pinY == null);

  return (
    <div className="max-w-5xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold">Floor plans</h1>
        <button
          onClick={() => { setEditMode((v) => !v); setPinningZoneId(null); }}
          className={editMode ? "btn-primary" : "btn-ghost border border-slate-300"}
        >
          {editMode ? "✓ Done editing" : "✎ Edit"}
        </button>
      </div>

      {/* ── Building + floor selectors (always visible) ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[180px]">
          <label className="field-label">Building</label>
          <select
            value={activeBuildingId ?? ""}
            onChange={(e) => { setActiveBuildingId(e.target.value || null); setActiveFloorId(null); }}
            className="w-full px-3 py-2 text-sm rounded"
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
            className="w-full px-3 py-2 text-sm rounded disabled:opacity-50"
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
                  className={"px-3 py-1.5 text-sm rounded " + (activeBuildingId === b.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200")}
                >{b.name}</button>
              ))}
            </div>
            <div className="flex gap-2 max-w-md">
              <input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="New building name" className="flex-1 px-3 py-2 text-sm rounded" />
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
                        className={"flex-1 text-left px-3 py-1.5 text-sm rounded " + (activeFloorId === f.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200")}
                      >
                        {f.name}
                        {f.floorPlanUrl
                          ? <span className="ml-2 text-xs text-emerald-700">● plan</span>
                          : <span className="ml-2 text-xs text-slate-500">○ no plan</span>}
                      </button>
                      <button onClick={() => above && swapFloors.mutate({ a: f, b: above })} disabled={!above || swapFloors.isPending} title="Move up" className="px-2 py-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded hover:bg-slate-100">↑</button>
                      <button onClick={() => below && swapFloors.mutate({ a: f, b: below })} disabled={!below || swapFloors.isPending} title="Move down" className="px-2 py-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded hover:bg-slate-100">↓</button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 max-w-md">
                <input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="New floor name (e.g. Ground)" className="flex-1 px-3 py-2 text-sm rounded" />
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
                    <div key={z.id} className="flex items-center justify-between bg-slate-100 rounded px-3 py-1.5 text-sm">
                      <span>
                        {z.name}
                        {z.pinX != null
                          ? <span className="ml-2 text-xs text-emerald-700">● pinned</span>
                          : <span className="ml-2 text-xs text-amber-700">○ needs pin</span>}
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
                          className="text-xs text-red-700 hover:text-red-700"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 max-w-md">
                <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="New zone (e.g. Toilet, Reception)" className="flex-1 px-3 py-2 text-sm rounded" />
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
        <div className="card text-center text-slate-500 py-10">
          {buildingList.length === 0
            ? <>No buildings yet. Tap <span className="text-slate-800 font-medium">✎ Edit</span> to add your first building, floor, and zones.</>
            : "Select a building above to view its floor plans."}
        </div>
      ) : !activeFloorId ? (
        <div className="card text-center text-slate-500 py-10">
          {sortedFloors.length === 0
            ? <>No floors in this building yet. Tap <span className="text-slate-800 font-medium">✎ Edit</span> to add one.</>
            : "Select a floor above."}
        </div>
      ) : (
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
            <div className="mb-3 text-sm text-red-700 bg-red-950/40 border border-red-900 rounded px-3 py-2">
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
                <img src={planSrc(activeFloor.floorPlanUrl)} alt="" className="block max-w-full max-h-[600px]" />
                {pinnedZones.map((z) => {
                  const status = zoneStatusById.get(z.id);
                  const isOffline = offlineZoneIds.has(z.id);
                  let pinClass: string; let label: string; let inner: JSX.Element | null = null;
                  if (status === "open") { pinClass = "bg-red-500 animate-pulse"; label = " — ALERT"; }
                  else if (status === "acknowledged") { pinClass = "bg-blue-500 animate-pulse"; label = " — cleaning in progress"; }
                  else if (isOffline) {
                    pinClass = "bg-amber-400 border-dashed border-amber-700"; label = " — hanger offline";
                    inner = <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-900 leading-none">?</span>;
                  } else { pinClass = "bg-green-500"; label = ""; }
                  return (
                    <div
                      key={z.id}
                      title={`${z.name}${label}`}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow ${pinClass}`}
                      style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
                    >{inner}</div>
                  );
                })}
              </div>
              {editMode && unpinnedZones.length > 0 && (
                <div className="mt-3 text-sm text-amber-700">
                  {unpinnedZones.length} zone{unpinnedZones.length === 1 ? "" : "s"} still need a pin: use “place pin” above.
                </div>
              )}
              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> OK</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Alert</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Cleaning</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Offline</span>
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
                (dragOver ? "border-blue-300 bg-blue-950/20" : "border-slate-300 hover:border-slate-300")}
            >
              <div className="text-slate-600 font-medium">Drop a floor-plan image here</div>
              <div className="text-sm text-slate-500 mt-1">or click to choose a file · PNG or JPEG · up to 8 MB</div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              No plan uploaded for this floor yet. Tap <span className="text-slate-800 font-medium">✎ Edit</span> to upload one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
