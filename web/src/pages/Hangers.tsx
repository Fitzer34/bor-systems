import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";

interface Hanger {
  id: string;
  devEui: string;
  name: string | null;
  locationNote: string | null;
  status: "active" | "out_of_service" | "decommissioned";
  zoneId: string | null;
  batteryPct: number | null;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  audibleAlarmEnabled: boolean;
}

interface ZoneFull { id: string; name: string; floorId: string; floorName: string; buildingName: string; buildingId: string }
interface Zone     { id: string; name: string; floorId: string }
interface Floor    { id: string; name: string; buildingId: string; orderIndex: number }
interface Building { id: string; name: string }

const ONLINE_WINDOW_MS = 90 * 1000;

export function Hangers() {
  useTicker(1000);
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "supervisor";

  const hangers = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 5_000,
  });
  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ lowBatteryThreshold: number }>("/settings"),
    enabled: isStaff,
  });
  const lowBatteryThreshold = settings.data?.lowBatteryThreshold ?? 20;

  // Flatten the building → floor → zone tree into a single list we can
  // search and render efficiently.
  const allZones = useQuery({
    queryKey: ["all-zones", buildings.data?.buildings.map((b) => b.id)],
    enabled: !!buildings.data,
    queryFn: async () => {
      const out: ZoneFull[] = [];
      for (const b of buildings.data!.buildings) {
        const fs = await api<{ floors: Floor[] }>(`/buildings/${b.id}/floors`);
        for (const f of fs.floors) {
          const zs = await api<{ zones: Zone[] }>(`/floors/${f.id}/zones`);
          for (const z of zs.zones) {
            out.push({
              ...z,
              floorName: f.name,
              buildingId: b.id,
              buildingName: b.name,
            });
          }
        }
      }
      return out;
    },
  });

  const [editing, setEditing] = useState<Hanger | null>(null);
  const [registering, setRegistering] = useState(false);

  if (hangers.isLoading) {
    return <div className="p-8 text-slate-400">Loading hangers…</div>;
  }
  if (hangers.error) {
    return <div className="p-8 text-red-400">Could not load hangers.</div>;
  }

  const list = hangers.data?.hangers ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-semibold">Hangers</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-slate-400 hidden md:block">
            One per wet-floor sign. Onboard via the iOS app or register
            by DevEUI here.
          </p>
          {isStaff && (
            <button
              onClick={() => setRegistering(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap"
            >
              + Register hanger
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-200">No hangers registered yet.</p>
          <p className="text-sm text-slate-400 mt-2">
            Plug in a HazardLink hanger and run <em>More → Add a hanger</em>{" "}
            on the iOS app — it'll appear here once it joins WiFi.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((h) => (
            <HangerCard
              key={h.id}
              hanger={h}
              zone={allZones.data?.find((z) => z.id === h.zoneId)}
              lowBatteryThreshold={lowBatteryThreshold}
              isStaff={isStaff}
              onClick={() => setEditing(h)}
            />
          ))}
        </div>
      )}

      {editing && (
        <HangerEditDialog
          hanger={editing}
          buildings={buildings.data?.buildings ?? []}
          allZones={allZones.data ?? []}
          isAdmin={isAdmin}
          isStaff={isStaff}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["hangers"] });
            setEditing(null);
          }}
          onStatusChanged={() => {
            qc.invalidateQueries({ queryKey: ["hangers"] });
            setEditing(null);
          }}
        />
      )}

      {registering && (
        <RegisterHangerDialog
          buildings={buildings.data?.buildings ?? []}
          onClose={() => setRegistering(false)}
          onRegistered={() => {
            qc.invalidateQueries({ queryKey: ["hangers"] });
            qc.invalidateQueries({ queryKey: ["buildings"] });
            qc.invalidateQueries({ queryKey: ["all-zones"] });
            setRegistering(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

interface CardProps {
  hanger: Hanger;
  zone: ZoneFull | undefined;
  lowBatteryThreshold: number;
  isStaff: boolean;
  onClick: () => void;
}

function HangerCard({ hanger, zone, lowBatteryThreshold, isStaff, onClick }: CardProps) {
  const status = computeStatus(hanger);
  const locationLabel = zone
    ? `${zone.buildingName} / ${zone.floorName} / ${zone.name}`
    : "Unassigned";

  const lowBatt = hanger.batteryPct !== null && hanger.batteryPct <= lowBatteryThreshold;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700 transition p-4 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="font-medium text-slate-100">
              {hanger.name || hanger.devEui}
            </h3>
            <StatusPill status={status} />
            {lowBatt && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/15 text-red-300">
                Low battery
              </span>
            )}
          </div>

          {hanger.name && (
            <p className="text-xs text-slate-400 font-mono">{hanger.devEui}</p>
          )}

          <p className="mt-2 text-sm text-slate-300">{locationLabel}</p>

          {hanger.locationNote && (
            <p className="mt-1 text-sm text-slate-300 italic">
              📍 {hanger.locationNote}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <Field label="Battery" value={hanger.batteryPct !== null ? `${hanger.batteryPct}%` : "—"} highlight={lowBatt} />
            {hanger.firmwareVersion && <Field label="FW" value={hanger.firmwareVersion} />}
            <Field
              label="Last seen"
              value={hanger.lastSeenAt ? relativeTime(hanger.lastSeenAt) : "Never"}
            />
            <Field label="Audible alarm" value={hanger.audibleAlarmEnabled ? "On" : "Off"} />
          </div>
        </div>

        <div className="text-slate-400 text-xs whitespace-nowrap shrink-0">
          {isStaff ? "Tap to edit →" : "View →"}
        </div>
      </div>
    </button>
  );
}

function Field({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span>
      <span className="text-slate-400">{label}:</span>{" "}
      <span className={highlight ? "text-red-300" : "text-slate-100"}>{value}</span>
    </span>
  );
}

type StatusKey = "online" | "offline" | "out_of_service" | "decommissioned";

function StatusPill({ status }: { status: StatusKey }) {
  const styles: Record<StatusKey, string> = {
    online:          "bg-emerald-500/15 text-emerald-300",
    offline:         "bg-amber-500/15 text-amber-300",
    out_of_service:  "bg-orange-500/15 text-orange-300",
    decommissioned:  "bg-slate-700/40 text-slate-400",
  };
  const labels: Record<StatusKey, string> = {
    online:          "Online",
    offline:         "Offline",
    out_of_service:  "Out of service",
    decommissioned:  "Decommissioned",
  };
  return (
    <span className={"px-2 py-0.5 text-xs font-medium rounded-full " + styles[status]}>
      {labels[status]}
    </span>
  );
}

function computeStatus(h: Hanger): StatusKey {
  if (h.status === "out_of_service") return "out_of_service";
  if (h.status === "decommissioned") return "decommissioned";
  const isOnline = h.lastSeenAt && Date.now() - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
  return isOnline ? "online" : "offline";
}

// ─── Edit dialog ───────────────────────────────────────────────────────────

interface DialogProps {
  hanger: Hanger;
  buildings: Building[];
  allZones: ZoneFull[];
  isAdmin: boolean;
  isStaff: boolean;
  onClose: () => void;
  onSaved: () => void;
  onStatusChanged: () => void;
}

function HangerEditDialog({
  hanger,
  buildings,
  allZones,
  isAdmin,
  isStaff,
  onClose,
  onSaved,
  onStatusChanged,
}: DialogProps) {
  const initialZone = allZones.find((z) => z.id === hanger.zoneId);
  const [name, setName] = useState(hanger.name ?? "");
  const [locationNote, setLocationNote] = useState(hanger.locationNote ?? "");
  const [audibleAlarm, setAudibleAlarm] = useState(hanger.audibleAlarmEnabled);
  const [buildingId, setBuildingId] = useState(initialZone?.buildingId ?? "");
  const [floorId, setFloorId] = useState(initialZone?.floorId ?? "");
  const [zoneId, setZoneId] = useState(hanger.zoneId ?? "");
  const [confirmingDecommission, setConfirmingDecommission] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Floors for the currently-picked building (filtered from the zones tree).
  const floorsForBuilding = (() => {
    if (!buildingId) return [] as { id: string; name: string }[];
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const z of allZones) {
      if (z.buildingId === buildingId && !seen.has(z.floorId)) {
        seen.add(z.floorId);
        out.push({ id: z.floorId, name: z.floorName });
      }
    }
    return out;
  })();

  const zonesForFloor = floorId
    ? allZones.filter((z) => z.floorId === floorId)
    : [];

  // Esc to close — matches Gateways modal behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () =>
      api(`/hangers/${hanger.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || null,
          locationNote: locationNote.trim() || null,
          zoneId: zoneId || null,
          audibleAlarmEnabled: audibleAlarm,
        }),
      }),
    onSuccess: onSaved,
  });

  const decommission = useMutation({
    mutationFn: () => api(`/hangers/${hanger.id}/decommission`, { method: "POST" }),
    onSuccess: onStatusChanged,
  });

  const recommission = useMutation({
    mutationFn: () => api(`/hangers/${hanger.id}/recommission`, { method: "POST" }),
    onSuccess: onStatusChanged,
  });

  // Hard delete — fully removes the hanger + its alerts/events. For clearing
  // test / seed / misregistered entries. Distinct from decommission (which
  // archives a real device but keeps its history).
  const remove = useMutation({
    mutationFn: () => api(`/hangers/${hanger.id}`, { method: "DELETE" }),
    onSuccess: onStatusChanged,
  });

  const hasChanges =
    name !== (hanger.name ?? "") ||
    locationNote !== (hanger.locationNote ?? "") ||
    zoneId !== (hanger.zoneId ?? "") ||
    audibleAlarm !== hanger.audibleAlarmEnabled;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-xl w-full max-w-2xl border border-slate-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">Hanger details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <Section title="Identification">
            <FieldGroup label="Name">
              {isStaff ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Ward 4B main bathroom"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
                />
              ) : (
                <div className="text-slate-100 text-sm">{name || "—"}</div>
              )}
            </FieldGroup>
            <FieldGroup label="DevEUI">
              <div className="text-slate-300 text-sm font-mono">{hanger.devEui}</div>
            </FieldGroup>
          </Section>

          <Section title="Location">
            {isStaff ? (
              <>
                <FieldGroup label="Building">
                  <select
                    value={buildingId}
                    onChange={(e) => {
                      setBuildingId(e.target.value);
                      setFloorId("");
                      setZoneId("");
                    }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
                  >
                    <option value="">— Unassigned —</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="Floor">
                  <select
                    value={floorId}
                    onChange={(e) => { setFloorId(e.target.value); setZoneId(""); }}
                    disabled={!buildingId}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm disabled:opacity-50"
                  >
                    <option value="">— Unassigned —</option>
                    {floorsForBuilding.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="Zone">
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    disabled={!floorId}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm disabled:opacity-50"
                  >
                    <option value="">— Unassigned —</option>
                    {zonesForFloor.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="Where in the zone?">
                  <textarea
                    value={locationNote}
                    onChange={(e) => setLocationNote(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="e.g. behind the first stall on the right, on the wall opposite the sinks"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm resize-none"
                  />
                </FieldGroup>
              </>
            ) : (
              <>
                <ReadRow label="Location" value={initialZone ? `${initialZone.buildingName} / ${initialZone.floorName} / ${initialZone.name}` : "Unassigned"} />
                {locationNote && <ReadRow label="Where in the zone?" value={locationNote} />}
              </>
            )}
          </Section>

          <Section title="Alarm">
            {isStaff ? (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={audibleAlarm}
                  onChange={(e) => setAudibleAlarm(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 cursor-pointer"
                />
                <span className="text-slate-100 text-sm">Audible alarm on lift</span>
              </label>
            ) : (
              <ReadRow label="Audible alarm" value={audibleAlarm ? "On" : "Off"} />
            )}
          </Section>

          <Section title="Live state">
            <ReadRow label="Status" value={statusLabel(hanger)} />
            <ReadRow label="Battery" value={hanger.batteryPct !== null ? `${hanger.batteryPct}%` : "—"} />
            <ReadRow label="Firmware" value={hanger.firmwareVersion ?? "—"} />
            <ReadRow label="Last seen" value={hanger.lastSeenAt ? relativeTime(hanger.lastSeenAt) : "Never"} />
          </Section>

          {save.error && <p className="text-sm text-red-400">Couldn't save changes — try again.</p>}
          {(decommission.error || recommission.error) && (
            <p className="text-sm text-red-400">Couldn't change status — try again.</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          {isAdmin && (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-300">Permanently delete + all its alerts?</span>
                <button
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-slate-700 rounded text-white"
                >
                  {remove.isPending ? "…" : "Delete"}
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
                  Cancel
                </button>
              </div>
            ) : confirmingDecommission ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">Decommission this hanger?</span>
                <button
                  onClick={() => decommission.mutate()}
                  disabled={decommission.isPending}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-slate-700 rounded text-white"
                >
                  {decommission.isPending ? "…" : "Confirm"}
                </button>
                <button onClick={() => setConfirmingDecommission(false)} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {hanger.status === "decommissioned" ? (
                  <button
                    onClick={() => recommission.mutate()}
                    disabled={recommission.isPending}
                    className="px-3 py-1.5 text-sm text-green-400 hover:text-green-300 hover:bg-green-950/30 rounded"
                  >
                    {recommission.isPending ? "…" : "Recommission"}
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmingDecommission(true)}
                    className="px-3 py-1.5 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 rounded"
                  >
                    Decommission
                  </button>
                )}
                {/* Hard delete — for test/seed/misregistered junk. Decommission
                    is for real devices you're retiring (keeps history). */}
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
                >
                  Delete permanently
                </button>
              </div>
            )
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">Close</button>
            {isStaff && (
              <button
                onClick={() => save.mutate()}
                disabled={!hasChanges || save.isPending}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-white font-medium"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
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

function statusLabel(h: Hanger): string {
  if (h.status === "out_of_service") return "Out of service";
  if (h.status === "decommissioned") return "Decommissioned";
  const isOnline = h.lastSeenAt && Date.now() - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
  return isOnline ? "Online" : "Offline";
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Register hanger dialog ─────────────────────────────────────────────────
//
// Mirrors the iOS HangerLocationStep — DevEUI input on top, then a cascading
// Building/Floor/Zone picker where each level offers a "+ Create new" row
// that expands inline. The user can spin up a whole building tree from
// scratch and register the hanger to a brand-new zone without leaving the
// modal.

interface RegisterDialogProps {
  buildings: Building[];
  onClose: () => void;
  onRegistered: () => void;
}

function RegisterHangerDialog({ buildings, onClose, onRegistered }: RegisterDialogProps) {
  const [devEui, setDevEui] = useState("");
  const [audibleAlarm, setAudibleAlarm] = useState(false);

  // Picker state — IDs only; the listings come from queries below.
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [zoneId, setZoneId] = useState("");

  // Create-new inline expansion state — one per level.
  const [creatingBuilding, setCreatingBuilding] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  const [creatingZone, setCreatingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");

  // Local copies — start from props, append after each successful create
  // so the picker reflects the new entries without a refetch round-trip.
  const [localBuildings, setLocalBuildings] = useState<Building[]>(buildings);
  const [floors, setFloors] = useState<{ id: string; name: string; orderIndex: number }[]>([]);
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load floors when building changes.
  useEffect(() => {
    setFloorId("");
    setZoneId("");
    setFloors([]);
    setZones([]);
    if (!buildingId) return;
    api<{ floors: { id: string; name: string; orderIndex: number }[] }>(`/buildings/${buildingId}/floors`)
      .then((r) => setFloors(r.floors.sort((a, b) => a.orderIndex - b.orderIndex)))
      .catch(() => setError("Could not load floors."));
  }, [buildingId]);

  // Load zones when floor changes.
  useEffect(() => {
    setZoneId("");
    setZones([]);
    if (!floorId) return;
    api<{ zones: { id: string; name: string }[] }>(`/floors/${floorId}/zones`)
      .then((r) => setZones(r.zones))
      .catch(() => setError("Could not load zones."));
  }, [floorId]);

  const createBuilding = useMutation({
    mutationFn: (name: string) =>
      api<{ building: Building }>("/buildings", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: (data) => {
      setLocalBuildings((prev) => [...prev, data.building]);
      setBuildingId(data.building.id);
      setCreatingBuilding(false);
      setNewBuildingName("");
    },
    onError: () => setError("Could not create building."),
  });

  const createFloor = useMutation({
    mutationFn: ({ name }: { name: string }) => {
      const nextOrder = (floors.map((f) => f.orderIndex).reduce((a, b) => Math.max(a, b), -1) + 1);
      return api<{ floor: { id: string; name: string; orderIndex: number } }>(
        `/buildings/${buildingId}/floors`,
        { method: "POST", body: JSON.stringify({ name, orderIndex: nextOrder }) },
      );
    },
    onSuccess: (data) => {
      setFloors((prev) => [...prev, data.floor]);
      setFloorId(data.floor.id);
      setCreatingFloor(false);
      setNewFloorName("");
    },
    onError: () => setError("Could not create floor."),
  });

  const createZone = useMutation({
    mutationFn: ({ name }: { name: string }) =>
      api<{ zone: { id: string; name: string } }>(
        `/floors/${floorId}/zones`,
        { method: "POST", body: JSON.stringify({ name }) },
      ),
    onSuccess: (data) => {
      setZones((prev) => [...prev, data.zone]);
      setZoneId(data.zone.id);
      setCreatingZone(false);
      setNewZoneName("");
    },
    onError: () => setError("Could not create zone."),
  });

  const register = useMutation({
    mutationFn: () =>
      api("/hangers/register", {
        method: "POST",
        body: JSON.stringify({
          devEui: devEui.toUpperCase(),
          zoneId: zoneId || undefined,
          audibleAlarmEnabled: audibleAlarm,
        }),
      }),
    onSuccess: onRegistered,
    onError: (err: unknown) => {
      // Surface the most useful message we can from the backend, falling
      // through a few shapes (ApiError with a structured body, plain Error,
      // anything else) so the customer sees the actual problem instead of
      // a generic guess.
      // ApiError shape from web/src/lib/api.ts: { status, payload }.
      const e = err as { status?: number; payload?: { error?: string; details?: Record<string, string[]> } };
      if (e?.status === 409) {
        setError("That DevEUI is already registered to a hanger in your org.");
        return;
      }
      if (e?.status === 400 && e.payload?.details) {
        const first = Object.values(e.payload.details).flat()[0];
        if (first) { setError(first); return; }
      }
      if (e?.payload?.error) {
        setError(`Backend rejected: ${e.payload.error}`);
        return;
      }
      setError("Couldn't register — try again.");
    },
  });

  const devEuiValid = /^[0-9A-Za-z]{8,32}$/.test(devEui.trim());

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 rounded-xl w-full max-w-2xl border border-slate-700 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">Register hanger</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <Section title="Device">
            <FieldGroup label="DevEUI">
              <input
                type="text"
                value={devEui}
                onChange={(e) => setDevEui(e.target.value)}
                autoFocus
                placeholder="e.g. BOR3C0F02EADB342"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm font-mono"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Read it off the OLED's first boot screen, the gateway's
                "1 device connected" attribution, or the hanger's serial output.
              </p>
            </FieldGroup>
          </Section>

          <Section title="Location">
            <PickerRow
              label="Building"
              options={localBuildings.map((b) => ({ id: b.id, name: b.name }))}
              selectedId={buildingId}
              onSelect={setBuildingId}
              creating={creatingBuilding}
              onStartCreate={() => setCreatingBuilding(true)}
              onCancelCreate={() => { setCreatingBuilding(false); setNewBuildingName(""); }}
              draftName={newBuildingName}
              setDraftName={setNewBuildingName}
              placeholder="e.g. Mercy Hospital"
              saving={createBuilding.isPending}
              onSave={() => {
                const n = newBuildingName.trim();
                if (n) createBuilding.mutate(n);
              }}
            />

            {buildingId && (
              <PickerRow
                label="Floor"
                options={floors.map((f) => ({ id: f.id, name: f.name }))}
                selectedId={floorId}
                onSelect={setFloorId}
                creating={creatingFloor}
                onStartCreate={() => setCreatingFloor(true)}
                onCancelCreate={() => { setCreatingFloor(false); setNewFloorName(""); }}
                draftName={newFloorName}
                setDraftName={setNewFloorName}
                placeholder="e.g. Ground floor, 1st floor"
                saving={createFloor.isPending}
                onSave={() => {
                  const n = newFloorName.trim();
                  if (n) createFloor.mutate({ name: n });
                }}
              />
            )}

            {floorId && (
              <PickerRow
                label="Zone"
                options={zones.map((z) => ({ id: z.id, name: z.name }))}
                selectedId={zoneId}
                onSelect={setZoneId}
                creating={creatingZone}
                onStartCreate={() => setCreatingZone(true)}
                onCancelCreate={() => { setCreatingZone(false); setNewZoneName(""); }}
                draftName={newZoneName}
                setDraftName={setNewZoneName}
                placeholder="e.g. Reception, Toilets, Canteen"
                saving={createZone.isPending}
                onSave={() => {
                  const n = newZoneName.trim();
                  if (n) createZone.mutate({ name: n });
                }}
              />
            )}
          </Section>

          <Section title="Alarm">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={audibleAlarm}
                onChange={(e) => setAudibleAlarm(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 cursor-pointer"
              />
              <span className="text-slate-100 text-sm">Audible alarm on lift</span>
            </label>
          </Section>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">Cancel</button>
          <button
            onClick={() => { setError(null); register.mutate(); }}
            disabled={!devEuiValid || register.isPending}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-white font-medium"
          >
            {register.isPending
              ? "Registering…"
              : zoneId
                ? "Register here"
                : "Register — assign later"}
          </button>
        </div>
      </div>
    </div>
  );
}

// One picker row — used for Building, Floor, Zone. Existing options render
// as a vertical list of clickable chips; a "+ Create new" row at the bottom
// expands inline into a name field + Save when clicked.

interface PickerRowProps {
  label: string;
  options: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  creating: boolean;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  draftName: string;
  setDraftName: (s: string) => void;
  placeholder: string;
  saving: boolean;
  onSave: () => void;
}

function PickerRow({
  label, options, selectedId, onSelect,
  creating, onStartCreate, onCancelCreate,
  draftName, setDraftName, placeholder, saving, onSave,
}: PickerRowProps) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <div className="space-y-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={
              "w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between " +
              (selectedId === o.id
                ? "bg-blue-500/15 text-blue-200 border border-blue-500/40"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-transparent")
            }
          >
            <span>{o.name}</span>
            {selectedId === o.id && <span className="text-blue-300">✓</span>}
          </button>
        ))}
        {creating ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
              autoFocus
              placeholder={placeholder}
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
            />
            <button
              onClick={onSave}
              disabled={!draftName.trim() || saving}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded text-white"
            >
              {saving ? "…" : "Save"}
            </button>
            <button onClick={onCancelCreate} className="px-2 text-slate-400 hover:text-white text-lg">×</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartCreate}
            className="w-full text-left px-3 py-2 rounded text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 border border-dashed border-slate-700"
          >
            + Add new {label.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  );
}
