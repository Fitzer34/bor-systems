import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";

interface Gateway {
  id: string;
  devEui: string;
  name: string | null;
  buildingId: string | null;
  ipAddress: string | null;
  ssid: string | null;
  rssi: number | null;
  firmwareVersion: string | null;
  packetsForwarded: number;
  uptimeSec: number | null;
  lastSeenAt: string | null;
  createdAt: string;
}

interface Building { id: string; name: string }

/// Gateways heartbeat every 60s, so 90s tolerates one missed beat. Same
/// threshold the iOS app uses — keep in sync.
const ONLINE_WINDOW_SEC = 90;

export function Gateways() {
  // 1s ticker so Online/Offline badges flip the moment the silence window
  // crosses, without waiting on the next React-Query refetch.
  useTicker(1000);

  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const gateways = useQuery({
    queryKey: ["gateways"],
    queryFn: () => api<{ gateways: Gateway[] }>("/gateways"),
    refetchInterval: 10_000,  // less aggressive than hangers — heartbeats are 60s anyway
  });
  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
  });

  const [renaming, setRenaming] = useState<{ id: string; current: string } | null>(null);
  const [newName, setNewName] = useState("");

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api(`/gateways/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateways"] });
      setRenaming(null);
      setNewName("");
    },
  });

  const moveToBuilding = useMutation({
    mutationFn: ({ id, buildingId }: { id: string; buildingId: string | null }) =>
      api(`/gateways/${id}`, { method: "PATCH", body: JSON.stringify({ buildingId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateways"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/gateways/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateways"] }),
  });

  const buildingName = (id: string | null): string => {
    if (!id) return "—";
    const b = buildings.data?.buildings.find((x) => x.id === id);
    return b?.name ?? "—";
  };

  if (gateways.isLoading) {
    return <div className="p-8 text-slate-400">Loading gateways…</div>;
  }
  if (gateways.error) {
    return <div className="p-8 text-red-400">Could not load gateways.</div>;
  }

  const list = gateways.data?.gateways ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Gateways</h1>
        <p className="text-sm text-slate-400">
          One per building. Self-registers via the iOS app's <span className="font-medium">Add a gateway</span> flow.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-300">No gateways registered yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Plug in your HazardLink gateway and run <em>More → Add a gateway</em> on the iOS app.
            It'll appear here within ~60 seconds of joining WiFi.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((g) => (
            <GatewayCard
              key={g.id}
              gateway={g}
              buildingLabel={buildingName(g.buildingId)}
              buildings={buildings.data?.buildings ?? []}
              isAdmin={isAdmin}
              onRename={() => {
                setRenaming({ id: g.id, current: g.name ?? "" });
                setNewName(g.name ?? "");
              }}
              onAssignBuilding={(buildingId) => moveToBuilding.mutate({ id: g.id, buildingId })}
              onDelete={() => {
                if (confirm(`Remove gateway "${g.name ?? g.devEui}"? It can re-register by booting again.`)) {
                  remove.mutate(g.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Rename dialog */}
      {renaming && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRenaming(null)}>
          <div className="bg-slate-900 rounded-lg p-6 w-full max-w-md border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-medium mb-3">Rename gateway</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              maxLength={80}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
              placeholder="e.g. Mercy Hospital basement"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRenaming(null)} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => rename.mutate({ id: renaming.id, name: newName.trim() })}
                disabled={!newName.trim() || rename.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-white"
              >
                {rename.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  gateway: Gateway;
  buildingLabel: string;
  buildings: Building[];
  isAdmin: boolean;
  onRename: () => void;
  onAssignBuilding: (buildingId: string | null) => void;
  onDelete: () => void;
}

function GatewayCard({ gateway, buildingLabel, buildings, isAdmin, onRename, onAssignBuilding, onDelete }: CardProps) {
  const isOnline = gateway.lastSeenAt
    ? (Date.now() - new Date(gateway.lastSeenAt).getTime()) / 1000 <= ONLINE_WINDOW_SEC
    : false;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-medium text-slate-100">{gateway.name ?? gateway.devEui}</h3>
            <span
              className={
                "px-2 py-0.5 text-xs font-medium rounded-full " +
                (isOnline
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300")
              }
            >
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono">{gateway.devEui}</p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-400">
            {gateway.ipAddress && (
              <span><span className="text-slate-500">IP:</span> {gateway.ipAddress}</span>
            )}
            {gateway.ssid && (
              <span><span className="text-slate-500">WiFi:</span> {gateway.ssid}</span>
            )}
            {gateway.rssi !== null && (
              <span><span className="text-slate-500">RSSI:</span> {gateway.rssi} dBm</span>
            )}
            <span><span className="text-slate-500">Forwarded:</span> {gateway.packetsForwarded.toLocaleString()} pkts</span>
            {gateway.uptimeSec !== null && (
              <span><span className="text-slate-500">Uptime:</span> {formatUptime(gateway.uptimeSec)}</span>
            )}
            {gateway.firmwareVersion && (
              <span><span className="text-slate-500">FW:</span> {gateway.firmwareVersion}</span>
            )}
            {gateway.lastSeenAt && (
              <span><span className="text-slate-500">Last seen:</span> {relativeTime(gateway.lastSeenAt)}</span>
            )}
            <span><span className="text-slate-500">Building:</span> {buildingLabel}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-1.5 text-xs">
            <button onClick={onRename} className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded">
              Rename
            </button>
            <select
              value={gateway.buildingId ?? ""}
              onChange={(e) => onAssignBuilding(e.target.value || null)}
              className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 cursor-pointer"
              title="Assign to building"
            >
              <option value="">— No building —</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button onClick={onDelete} className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded">
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
