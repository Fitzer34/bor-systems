import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, getToken } from "../lib/api";

interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }
interface ActiveAlert { id: string; zoneId: string | null; status: "open" | "acknowledged" | "closed" }
interface Hanger { id: string; zoneId: string | null; status: "active" | "out_of_service" | "decommissioned"; lastSeenAt: string | null }

/** A zone is considered offline if it has at least one active hanger and
 *  none of its active hangers have phoned home in the last 3 minutes. */
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export function FloorPlans() {
  const qc = useQueryClient();
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState("");
  const [floorName, setFloorName] = useState("");
  const [zoneName, setZoneName] = useState("");

  const buildings = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);
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
  // Fetch hangers so we can flag offline zones on the floor plan. Refetch
  // every 30s so the indicator stays live without a page refresh.
  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 30_000,
  });

  const zoneStatusById = new Map<string, "open" | "acknowledged">();
  for (const a of activeAlerts.data?.alerts ?? []) {
    if (a.zoneId && a.status !== "closed") zoneStatusById.set(a.zoneId, a.status);
  }

  // A zone is "offline" when it has active hangers but none have phoned home
  // recently. Decommissioned or out-of-service hangers don't count — those
  // zones just have no monitoring rather than offline monitoring.
  const offlineZoneIds = new Set<string>();
  const now = Date.now();
  const zoneHangers = new Map<string, Hanger[]>();
  for (const h of hangers.data?.hangers ?? []) {
    if (!h.zoneId || h.status !== "active") continue;
    const list = zoneHangers.get(h.zoneId) ?? [];
    list.push(h);
    zoneHangers.set(h.zoneId, list);
  }
  for (const [zoneId, hs] of zoneHangers.entries()) {
    const anyOnline = hs.some((h) => h.lastSeenAt != null
      && now - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS);
    if (!anyOnline) offlineZoneIds.add(zoneId);
  }

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
  const updateZonePin = useMutation({
    mutationFn: (z: { id: string; pinX: number; pinY: number }) =>
      api(`/zones/${z.id}`, { method: "PATCH", body: JSON.stringify({ pinX: z.pinX, pinY: z.pinY }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zones", activeFloorId] }),
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPlan = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/floors/${activeFloorId}/floor-plan`, {
        method: "POST",
        headers: { authorization: `Bearer ${getToken() ?? ""}` },
        body: fd,
      });
      if (!res.ok) throw new Error("upload failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["floors", activeBuildingId] }),
  });

  const [pinningZoneId, setPinningZoneId] = useState<string | null>(null);
  const activeFloor = floors.data?.floors.find((f) => f.id === activeFloorId);

  const handlePlanClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pinningZoneId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    updateZonePin.mutate({ id: pinningZoneId, pinX: x, pinY: y });
    setPinningZoneId(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Floor plans</h1>

      <div className="mb-6 bg-white border rounded-lg p-4 grid grid-cols-3 gap-4">
        <div>
          <div className="font-medium mb-2">Buildings</div>
          <ul className="space-y-1 text-sm">
            {buildings.data?.buildings.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => { setActiveBuildingId(b.id); setActiveFloorId(null); }}
                  className={`block w-full text-left rounded px-2 py-1 ${activeBuildingId === b.id ? "bg-slate-200" : "hover:bg-slate-100"}`}
                >{b.name}</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="New building" className="border rounded px-2 py-1 text-sm flex-1" />
            <button onClick={() => createBuilding.mutate()} disabled={!buildingName} className="text-sm bg-slate-900 text-white rounded px-3 py-1 disabled:opacity-50">Add</button>
          </div>
        </div>

        <div>
          <div className="font-medium mb-2">Floors</div>
          {!activeBuildingId ? <div className="text-sm text-slate-500">Pick a building.</div> : (
            <>
              <ul className="space-y-1 text-sm">
                {floors.data?.floors.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => setActiveFloorId(f.id)} className={`block w-full text-left rounded px-2 py-1 ${activeFloorId === f.id ? "bg-slate-200" : "hover:bg-slate-100"}`}>{f.name}</button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="New floor" className="border rounded px-2 py-1 text-sm flex-1" />
                <button onClick={() => createFloor.mutate()} disabled={!floorName} className="text-sm bg-slate-900 text-white rounded px-3 py-1 disabled:opacity-50">Add</button>
              </div>
            </>
          )}
        </div>

        <div>
          <div className="font-medium mb-2">Zones</div>
          {!activeFloorId ? <div className="text-sm text-slate-500">Pick a floor.</div> : (
            <>
              <ul className="space-y-1 text-sm">
                {zones.data?.zones.map((z) => (
                  <li key={z.id} className="flex items-center justify-between">
                    <span>{z.name}{z.pinX != null ? " · pinned" : ""}</span>
                    {activeFloor?.floorPlanUrl && (
                      <button onClick={() => setPinningZoneId(z.id)} className="text-xs text-blue-600 hover:underline">
                        {pinningZoneId === z.id ? "click on plan…" : "place pin"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="New zone" className="border rounded px-2 py-1 text-sm flex-1" />
                <button onClick={() => createZone.mutate()} disabled={!zoneName} className="text-sm bg-slate-900 text-white rounded px-3 py-1 disabled:opacity-50">Add</button>
              </div>
            </>
          )}
        </div>
      </div>

      {activeFloorId && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">{activeFloor?.name} plan</div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPlan.mutate(f); }}
              />
              <button onClick={() => fileInput.current?.click()} className="text-sm bg-slate-900 text-white rounded px-3 py-1">
                {activeFloor?.floorPlanUrl ? "Replace plan" : "Upload plan"}
              </button>
            </div>
          </div>
          {activeFloor?.floorPlanUrl ? (
            <div
              onClick={handlePlanClick}
              className={`relative inline-block ${pinningZoneId ? "cursor-crosshair" : ""}`}
            >
              <img src={activeFloor.floorPlanUrl} alt="" className="block max-w-full max-h-[600px]" />
              {zones.data?.zones.filter((z) => z.pinX != null && z.pinY != null).map((z) => {
                const status = zoneStatusById.get(z.id);
                const isOffline = offlineZoneIds.has(z.id);

                // Alert state always wins — an offline hanger that managed
                // to send a "lifted" event before dying still needs cleaning.
                let pinClass: string;
                let label: string;
                let inner: JSX.Element | null = null;

                if (status === "open") {
                  pinClass = "bg-red-500 animate-pulse";
                  label = " — ALERT";
                } else if (status === "acknowledged") {
                  pinClass = "bg-blue-500 animate-pulse";
                  label = " — cleaning in progress";
                } else if (isOffline) {
                  // Distinct visual: hollow grey with a dashed border + "?"
                  // so it's obvious at a glance that the zone isn't reporting.
                  pinClass = "bg-slate-300 border-dashed";
                  label = " — hanger offline";
                  inner = (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 leading-none">?</span>
                  );
                } else {
                  pinClass = "bg-green-500";
                  label = "";
                }

                return (
                  <div
                    key={z.id}
                    title={`${z.name}${label}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow ${pinClass}`}
                    style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No plan uploaded for this floor yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
