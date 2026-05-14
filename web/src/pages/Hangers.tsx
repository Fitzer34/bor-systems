import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Hanger {
  id: string;
  devEui: string;
  status: "active" | "out_of_service" | "decommissioned";
  zoneId: string | null;
  batteryPct: number | null;
  lastSeenAt: string | null;
  audibleAlarmEnabled: boolean;
}

interface Zone { id: string; name: string; floorId: string }
interface Floor { id: string; name: string; buildingId: string }
interface Building { id: string; name: string }

export function Hangers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [devEui, setDevEui] = useState("");
  const [zoneId, setZoneId] = useState("");

  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    // Refetch every 5s so the Online/Offline badge flips within seconds of
    // a Pi going dark. Cheap — `/hangers` is a small JSON list.
    refetchInterval: 5_000,
  });
  const buildings = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ lowBatteryThreshold: number }>("/settings"), enabled: isAdmin || user?.role === "supervisor" });
  const lowBatteryThreshold = settings.data?.lowBatteryThreshold ?? 20;
  const allZones = useQuery({
    queryKey: ["all-zones", buildings.data?.buildings.map((b) => b.id)],
    enabled: !!buildings.data,
    queryFn: async () => {
      const out: Array<Zone & { floorName: string; buildingName: string }> = [];
      for (const b of buildings.data!.buildings) {
        const fs = await api<{ floors: Floor[] }>(`/buildings/${b.id}/floors`);
        for (const f of fs.floors) {
          const zs = await api<{ zones: Zone[] }>(`/floors/${f.id}/zones`);
          for (const z of zs.zones) out.push({ ...z, floorName: f.name, buildingName: b.name });
        }
      }
      return out;
    },
  });

  const register = useMutation({
    mutationFn: () =>
      api("/hangers/register", { method: "POST", body: JSON.stringify({ devEui, zoneId: zoneId || undefined }) }),
    onSuccess: () => {
      setDevEui("");
      setZoneId("");
      qc.invalidateQueries({ queryKey: ["hangers"] });
    },
  });

  const decommission = useMutation({
    mutationFn: (id: string) => api(`/hangers/${id}/decommission`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hangers"] }),
  });
  const recommission = useMutation({
    mutationFn: (id: string) => api(`/hangers/${id}/recommission`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hangers"] }),
  });
  const relocate = useMutation({
    mutationFn: ({ id, zoneId }: { id: string; zoneId: string }) =>
      api(`/hangers/${id}/relocate`, { method: "POST", body: JSON.stringify({ zoneId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hangers"] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Hangers</h1>

      {isAdmin && (
        <div className="mb-8 bg-white border rounded-lg p-4">
          <div className="font-medium mb-3">Register hanger</div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500">DevEUI (16 hex)</label>
              <input
                value={devEui}
                onChange={(e) => setDevEui(e.target.value)}
                placeholder="0011223344556677"
                className="border rounded px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Zone</label>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="border rounded px-3 py-2">
                <option value="">— unassigned —</option>
                {allZones.data?.map((z) => (
                  <option key={z.id} value={z.id}>{z.buildingName} / {z.floorName} / {z.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => register.mutate()}
              disabled={!/^[0-9A-Fa-f]{16}$/.test(devEui) || register.isPending}
              className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {register.isPending ? "…" : "Register"}
            </button>
          </div>
        </div>
      )}

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="p-2">DevEUI</th>
            <th className="p-2">Zone</th>
            <th className="p-2">Status</th>
            <th className="p-2">Battery</th>
            <th className="p-2">Last seen</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {hangers.data?.hangers.map((h) => {
            const zone = allZones.data?.find((z) => z.id === h.zoneId);
            return (
              <tr key={h.id} className="border-t">
                <td className="p-2 font-mono">{h.devEui}</td>
                <td className="p-2">
                  <select
                    value={h.zoneId ?? ""}
                    onChange={(e) => relocate.mutate({ id: h.id, zoneId: e.target.value })}
                    className="border rounded px-2 py-1"
                  >
                    <option value="">unassigned</option>
                    {allZones.data?.map((z) => (
                      <option key={z.id} value={z.id}>{z.buildingName} / {z.floorName} / {z.name}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  {(() => {
                    // Lifecycle states (out of service / decommissioned) win
                    // over real-time online state — a decommissioned hanger
                    // shouldn't show "online" even if it just phoned home.
                    if (h.status === "out_of_service") {
                      return <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">out of service</span>;
                    }
                    if (h.status === "decommissioned") {
                      return <span className="px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-600">decommissioned</span>;
                    }
                    // Active: derive online/offline from lastSeenAt.
                    // WiFi-Pi hangers heartbeat every 60s; allow 2 misses.
                    const ONLINE_WINDOW_MS = 3 * 60 * 1000;
                    const isOnline = h.lastSeenAt != null
                      && Date.now() - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
                    return isOnline
                      ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Online</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">Offline</span>;
                  })()}
                </td>
                <td className="p-2">
                  {h.batteryPct == null ? "—" : (
                    <span className={h.batteryPct <= lowBatteryThreshold ? "text-red-700 font-medium" : ""}>
                      {h.batteryPct}%{h.batteryPct <= lowBatteryThreshold ? " ⚠" : ""}
                    </span>
                  )}
                </td>
                <td className="p-2 text-slate-500">{h.lastSeenAt ? new Date(h.lastSeenAt).toLocaleString() : "never"}</td>
                <td className="p-2 text-right">
                  {isAdmin && h.status !== "decommissioned" && (
                    <button onClick={() => decommission.mutate(h.id)} className="text-red-600 hover:underline">Decommission</button>
                  )}
                  {isAdmin && h.status === "decommissioned" && (
                    <button onClick={() => recommission.mutate(h.id)} className="text-green-700 hover:underline">Recommission</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
