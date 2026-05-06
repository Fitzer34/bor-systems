import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, getToken } from "../lib/api";

interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }

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
              {zones.data?.zones.filter((z) => z.pinX != null && z.pinY != null).map((z) => (
                <div
                  key={z.id}
                  title={z.name}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow"
                  style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No plan uploaded for this floor yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
