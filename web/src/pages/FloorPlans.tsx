import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, getToken, apiUrl, API_BASE } from "../lib/api";
import { useTicker } from "../lib/ticker";

interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }
interface ActiveAlert { id: string; zoneId: string | null; status: "open" | "acknowledged" | "closed" }
interface Hanger { id: string; zoneId: string | null; status: "active" | "out_of_service" | "decommissioned"; lastSeenAt: string | null }

/** A zone is considered offline if it has at least one active hanger and
 *  none of its active hangers have phoned home in the last 3 minutes. */
const ONLINE_WINDOW_MS = 15 * 1000;

export function FloorPlans() {
  // 1-second ticker so offline pins appear within ~16s of a hanger going dark.
  useTicker(1000);

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
  // Fetch hangers so we can flag offline zones on the floor plan. 5s polling
  // so the indicator flips within seconds of a Pi going dark.
  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 5_000,
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

  /** Swap two floors' orderIndex values. This is what drives the order
   *  they appear in the Active alerts dashboard feed. */
  const swapFloors = useMutation({
    mutationFn: async (args: { a: Floor; b: Floor }) => {
      // Sequential rather than parallel so a transient unique-index conflict
      // can't happen if we ever add one on (buildingId, orderIndex).
      await api(`/floors/${args.a.id}`, { method: "PATCH", body: JSON.stringify({ orderIndex: args.b.orderIndex }) });
      await api(`/floors/${args.b.id}`, { method: "PATCH", body: JSON.stringify({ orderIndex: args.a.orderIndex }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["floors", activeBuildingId] });
      // Dashboard fetches via a different query key — refresh that too so
      // the order updates without a page reload.
      qc.invalidateQueries({ queryKey: ["all-site-floors"] });
    },
  });

  // Floors sorted by orderIndex (ascending) — same order the dashboard uses.
  const sortedFloors = [...(floors.data?.floors ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);

  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPlan = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      // Use apiUrl() so this hits the Render backend in prod (the hardcoded
      // /api path only works behind the dev Vite proxy — it 404'd live).
      const res = await fetch(apiUrl(`/floors/${activeFloorId}/floor-plan`), {
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

  // Floor-plan URLs come back either absolute (R2/CDN: "https://…") or
  // relative ("/uploads/floorplans/…" when the backend stores to local disk).
  // A relative path would resolve against app.hazardlink.ie (Cloudflare),
  // but the file actually lives on the Render backend — so prefix relative
  // paths with API_BASE. Absolute URLs pass through untouched.
  const planSrc = (url: string): string =>
    url.startsWith("http") ? url : `${API_BASE}${url}`;

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

      <div className="mb-6 bg-slate-900/50 border rounded-lg p-4 grid grid-cols-3 gap-4">
        <div>
          <div className="font-medium mb-2">Buildings</div>
          <ul className="space-y-1 text-sm">
            {buildings.data?.buildings.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => { setActiveBuildingId(b.id); setActiveFloorId(null); }}
                  className={`block w-full text-left rounded px-2 py-1 ${activeBuildingId === b.id ? "bg-slate-700" : "hover:bg-slate-800"}`}
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
          <div className="font-medium mb-1">Floors</div>
          <div className="text-xs text-slate-500 mb-2">
            Order here controls the order on the Active alerts dashboard.
          </div>
          {!activeBuildingId ? <div className="text-sm text-slate-500">Pick a building.</div> : (
            <>
              <ul className="space-y-1 text-sm">
                {sortedFloors.map((f, idx) => {
                  const above = idx > 0 ? sortedFloors[idx - 1] : null;
                  const below = idx < sortedFloors.length - 1 ? sortedFloors[idx + 1] : null;
                  return (
                    <li key={f.id} className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveFloorId(f.id)}
                        className={`flex-1 text-left rounded px-2 py-1 ${activeFloorId === f.id ? "bg-slate-700" : "hover:bg-slate-800"}`}
                      >{f.name}</button>
                      <button
                        onClick={() => above && swapFloors.mutate({ a: f, b: above })}
                        disabled={!above || swapFloors.isPending}
                        title="Move up"
                        className="px-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                      >↑</button>
                      <button
                        onClick={() => below && swapFloors.mutate({ a: f, b: below })}
                        disabled={!below || swapFloors.isPending}
                        title="Move down"
                        className="px-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                      >↓</button>
                    </li>
                  );
                })}
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
        <div className="bg-slate-900/50 border rounded-lg p-4">
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
              <img src={planSrc(activeFloor.floorPlanUrl)} alt="" className="block max-w-full max-h-[600px]" />
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
                  // Amber pin with a dashed border so it stands out from the
                  // calm green of healthy zones but doesn't compete with the
                  // red/blue pulsing pins for active alerts.
                  pinClass = "bg-amber-400 border-dashed border-amber-700";
                  label = " — hanger offline";
                  inner = (
                    <>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-900 leading-none">?</span>
                      <span className="absolute left-full ml-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-slate-900/80 px-1 rounded whitespace-nowrap">
                        offline
                      </span>
                    </>
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
