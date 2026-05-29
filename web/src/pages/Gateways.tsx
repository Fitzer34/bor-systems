import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";

interface Gateway {
  id: string;
  devEui: string;
  name: string | null;
  buildingId: string | null;
  locationNote: string | null;
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

const ONLINE_WINDOW_SEC = 90;

export function Gateways() {
  useTicker(1000);
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const gateways = useQuery({
    queryKey: ["gateways"],
    queryFn: () => api<{ gateways: Gateway[] }>("/gateways"),
    refetchInterval: 10_000,
  });
  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
  });

  const [editing, setEditing] = useState<Gateway | null>(null);

  const buildingName = (id: string | null): string => {
    if (!id) return "Unassigned";
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
          One per building. Self-registers via the iOS app's{" "}
          <span className="font-medium">Add a gateway</span> flow.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-200">No gateways registered yet.</p>
          <p className="text-sm text-slate-400 mt-2">
            Plug in your HazardLink gateway and run <em>More → Add a gateway</em>{" "}
            on the iOS app. It'll appear here within ~60 seconds.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((g) => (
            <GatewayCard
              key={g.id}
              gateway={g}
              buildingLabel={buildingName(g.buildingId)}
              isAdmin={isAdmin}
              onClick={() => setEditing(g)}
            />
          ))}
        </div>
      )}

      {editing && (
        <GatewayEditDialog
          gateway={editing}
          buildings={buildings.data?.buildings ?? []}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["gateways"] });
            setEditing(null);
          }}
          onRemoved={() => {
            qc.invalidateQueries({ queryKey: ["gateways"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────
//
// One card per gateway. The WHOLE card is clickable — opens the edit dialog.
// We use bumped contrast (text-slate-200 for values, text-slate-400 for
// labels) so values are readable against the dark background; the old
// 400/500 pair was nearly invisible.

interface CardProps {
  gateway: Gateway;
  buildingLabel: string;
  isAdmin: boolean;
  onClick: () => void;
}

function GatewayCard({ gateway, buildingLabel, isAdmin, onClick }: CardProps) {
  const isOnline = gateway.lastSeenAt
    ? (Date.now() - new Date(gateway.lastSeenAt).getTime()) / 1000 <= ONLINE_WINDOW_SEC
    : false;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700 transition p-4 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-medium text-slate-100">
              {gateway.name ?? gateway.devEui}
            </h3>
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
          <p className="text-xs text-slate-400 font-mono">{gateway.devEui}</p>

          {gateway.locationNote && (
            <p className="mt-2 text-sm text-slate-300 italic">
              📍 {gateway.locationNote}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-200">
            <Field label="Building" value={buildingLabel} />
            {gateway.ipAddress && <Field label="IP" value={gateway.ipAddress} />}
            {gateway.ssid && <Field label="WiFi" value={gateway.ssid} />}
            {gateway.rssi !== null && (
              <Field label="Signal" value={`${gateway.rssi} dBm ${signalLabel(gateway.rssi)}`} />
            )}
            <Field
              label="Forwarded"
              value={`${gateway.packetsForwarded.toLocaleString()} pkts`}
            />
            {gateway.uptimeSec !== null && (
              <Field label="Uptime" value={formatUptime(gateway.uptimeSec)} />
            )}
            {gateway.firmwareVersion && (
              <Field label="FW" value={gateway.firmwareVersion} />
            )}
            {gateway.lastSeenAt && (
              <Field label="Last seen" value={relativeTime(gateway.lastSeenAt)} />
            )}
          </div>
        </div>

        <div className="text-slate-400 text-xs whitespace-nowrap shrink-0">
          {isAdmin ? "Tap to edit →" : "View →"}
        </div>
      </div>
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-slate-400">{label}:</span>{" "}
      <span className="text-slate-100">{value}</span>
    </span>
  );
}

// ─── Edit dialog ────────────────────────────────────────────────────────────
//
// Mirrors the iOS GatewayDetailView. Editable name, building, location note
// at the top; read-only live state below; Save + Remove in the footer.

interface DialogProps {
  gateway: Gateway;
  buildings: Building[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}

function GatewayEditDialog({
  gateway,
  buildings,
  isAdmin,
  onClose,
  onSaved,
  onRemoved,
}: DialogProps) {
  const [name, setName] = useState(gateway.name ?? "");
  const [buildingId, setBuildingId] = useState(gateway.buildingId ?? "");
  const [locationNote, setLocationNote] = useState(gateway.locationNote ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Close on Escape — feels native for modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () =>
      api(`/gateways/${gateway.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || null,
          buildingId: buildingId || null,
          locationNote: locationNote.trim() || null,
        }),
      }),
    onSuccess: onSaved,
  });

  const remove = useMutation({
    mutationFn: () => api(`/gateways/${gateway.id}`, { method: "DELETE" }),
    onSuccess: onRemoved,
  });

  const hasChanges =
    name !== (gateway.name ?? "") ||
    buildingId !== (gateway.buildingId ?? "") ||
    locationNote !== (gateway.locationNote ?? "");

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-xl w-full max-w-2xl border border-slate-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">Gateway details</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <Section title="Identification">
            <FieldGroup label="Name">
              {isAdmin ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder={`Gateway ${gateway.devEui.slice(-4)}`}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
                />
              ) : (
                <div className="text-slate-100 text-sm">{name || "—"}</div>
              )}
            </FieldGroup>
            <FieldGroup label="DevEUI">
              <div className="text-slate-300 text-sm font-mono">{gateway.devEui}</div>
            </FieldGroup>
          </Section>

          <Section title="Location">
            <FieldGroup label="Building">
              {isAdmin ? (
                <select
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
                >
                  <option value="">— Unassigned —</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-slate-100 text-sm">
                  {buildings.find((b) => b.id === buildingId)?.name ?? "Unassigned"}
                </div>
              )}
            </FieldGroup>
            <FieldGroup label="Where in the building?">
              {isAdmin ? (
                <textarea
                  value={locationNote}
                  onChange={(e) => setLocationNote(e.target.value)}
                  maxLength={280}
                  rows={2}
                  placeholder="e.g. behind reception desk, Floor 2 cupboard, on the wall opposite the kitchen"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm resize-none"
                />
              ) : (
                <div className="text-slate-100 text-sm whitespace-pre-line">
                  {locationNote || "—"}
                </div>
              )}
            </FieldGroup>
          </Section>

          <Section title="Live state">
            <ReadRow label="IP" value={gateway.ipAddress ?? "—"} />
            <ReadRow label="WiFi" value={gateway.ssid ?? "—"} />
            <ReadRow
              label="Signal"
              value={gateway.rssi !== null ? `${gateway.rssi} dBm ${signalLabel(gateway.rssi)}` : "—"}
            />
            <ReadRow
              label="Forwarded"
              value={`${gateway.packetsForwarded.toLocaleString()} pkts`}
            />
            <ReadRow
              label="Uptime"
              value={gateway.uptimeSec !== null ? formatUptime(gateway.uptimeSec) : "—"}
            />
            <ReadRow label="Firmware" value={gateway.firmwareVersion ?? "—"} />
            <ReadRow
              label="Last heartbeat"
              value={gateway.lastSeenAt ? relativeTime(gateway.lastSeenAt) : "—"}
            />
          </Section>

          {save.error && (
            <p className="text-sm text-red-400">Couldn't save changes — try again.</p>
          )}
          {remove.error && (
            <p className="text-sm text-red-400">Couldn't remove gateway — try again.</p>
          )}
        </div>

        {/* Footer */}
        {isAdmin && (
          <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">Remove this gateway?</span>
                <button
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-slate-700 rounded text-white"
                >
                  {remove.isPending ? "Removing…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="px-3 py-1.5 text-sm text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
              >
                Remove gateway
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-slate-300 hover:text-white"
              >
                Close
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={!hasChanges || save.isPending}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-white font-medium"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
}

// ─── Formatting helpers ────────────────────────────────────────────────────

function signalLabel(rssi: number): string {
  if (rssi >= -45) return "(excellent)";
  if (rssi >= -55) return "(strong)";
  if (rssi >= -65) return "(good)";
  if (rssi >= -75) return "(weak)";
  return "(very weak)";
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
  if (sec < 86400)
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
