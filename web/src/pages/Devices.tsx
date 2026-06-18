import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";
import {
  HangerCard,
  HangerEditDialog,
  RegisterHangerDialog,
  ONLINE_WINDOW_MS,
  type Hanger,
  type ZoneFull,
  type Building,
} from "./Hangers";
import {
  GatewayCard,
  GatewayEditDialog,
  ONLINE_WINDOW_SEC,
  type Gateway,
} from "./Gateways";

/**
 * Devices — unified view of gateways + hangers, grouped by building.
 *
 * Replaces the separate "Gateways" and "Hangers" nav items. Each building
 * gets a collapsible section listing its gateway(s) first (the infrastructure)
 * then its hangers (the sensors). Devices that aren't assigned to a building
 * fall into an "Unassigned" group at the bottom.
 *
 * All the heavy lifting — cards, edit dialogs, the register-hanger flow — is
 * reused as-is from Hangers.tsx / Gateways.tsx; this page only does the
 * fetching, the building grouping, and the modal wiring.
 */

interface Floor { id: string; name: string; buildingId: string; orderIndex: number }
interface Zone { id: string; name: string; floorId: string }

interface DeviceGroup {
  key: string;       // building id, or UNASSIGNED
  name: string;
  gateways: Gateway[];
  hangers: Hanger[];
}

const UNASSIGNED = "__unassigned__";

export function Devices() {
  useTicker(1000); // keep relative "last seen" times fresh
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "supervisor";

  const hangersQ = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
    refetchInterval: 5_000,
  });
  const gatewaysQ = useQuery({
    queryKey: ["gateways"],
    queryFn: () => api<{ gateways: Gateway[] }>("/gateways"),
    refetchInterval: 10_000,
  });
  const buildingsQ = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
  });
  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ lowBatteryThreshold: number }>("/settings"),
    enabled: isStaff,
  });
  const lowBatteryThreshold = settingsQ.data?.lowBatteryThreshold ?? 20;

  // Flatten building → floor → zone so we can resolve each hanger's building
  // from its zoneId (hangers live in zones; gateways carry buildingId directly).
  const allZonesQ = useQuery({
    queryKey: ["all-zones", buildingsQ.data?.buildings.map((b) => b.id)],
    enabled: !!buildingsQ.data,
    queryFn: async () => {
      const out: ZoneFull[] = [];
      for (const b of buildingsQ.data!.buildings) {
        const fs = await api<{ floors: Floor[] }>(`/buildings/${b.id}/floors`);
        for (const f of fs.floors) {
          const zs = await api<{ zones: Zone[] }>(`/floors/${f.id}/zones`);
          for (const z of zs.zones) {
            out.push({ ...z, floorName: f.name, buildingId: b.id, buildingName: b.name });
          }
        }
      }
      return out;
    },
  });

  const [editingHanger, setEditingHanger] = useState<Hanger | null>(null);
  const [editingGateway, setEditingGateway] = useState<Gateway | null>(null);
  const [registering, setRegistering] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Wait for zones too (when there are buildings) so hangers land in the right
  // group on first paint instead of briefly flashing under "Unassigned".
  const zonesPending =
    !!buildingsQ.data && buildingsQ.data.buildings.length > 0 && allZonesQ.isLoading;

  if (hangersQ.isLoading || gatewaysQ.isLoading || buildingsQ.isLoading || zonesPending) {
    return <div className="p-8 text-slate-500">Loading devices…</div>;
  }
  if (hangersQ.error || gatewaysQ.error) {
    return <div className="p-8 text-red-700">Could not load devices.</div>;
  }

  const hangers = hangersQ.data?.hangers ?? [];
  const gateways = gatewaysQ.data?.gateways ?? [];
  const buildings = buildingsQ.data?.buildings ?? [];
  const allZones = allZonesQ.data ?? [];

  const zoneById = new Map(allZones.map((z) => [z.id, z] as const));
  const buildingName = (id: string) =>
    buildings.find((b) => b.id === id)?.name ?? "Unknown building";
  const hangerBuildingId = (h: Hanger): string | null =>
    h.zoneId ? zoneById.get(h.zoneId)?.buildingId ?? null : null;

  // ── Bucket devices by building ──────────────────────────────────────────
  const groupsMap = new Map<string, DeviceGroup>();
  const ensure = (key: string, name: string): DeviceGroup => {
    let g = groupsMap.get(key);
    if (!g) { g = { key, name, gateways: [], hangers: [] }; groupsMap.set(key, g); }
    return g;
  };
  for (const g of gateways) {
    const key = g.buildingId ?? UNASSIGNED;
    ensure(key, key === UNASSIGNED ? "Unassigned" : buildingName(g.buildingId!)).gateways.push(g);
  }
  for (const h of hangers) {
    const bId = hangerBuildingId(h);
    const key = bId ?? UNASSIGNED;
    ensure(key, key === UNASSIGNED ? "Unassigned" : buildingName(bId!)).hangers.push(h);
  }

  // Real buildings A→Z, "Unassigned" always last.
  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return a.name.localeCompare(b.name);
  });

  const totalDevices = gateways.length + hangers.length;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Building-summary helpers (mirror each page's own online logic).
  const gwOnline = (g: Gateway) =>
    !!g.lastSeenAt && (Date.now() - new Date(g.lastSeenAt).getTime()) / 1000 <= ONLINE_WINDOW_SEC;
  const hgOnline = (h: Hanger) =>
    h.status === "active" && !!h.lastSeenAt &&
    Date.now() - new Date(h.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
  const hgLowBatt = (h: Hanger) => h.batteryPct !== null && h.batteryPct <= lowBatteryThreshold;

  // Card renderers — shared across the linked / unassigned layouts below.
  const renderGateway = (g: Gateway, label: string) => (
    <GatewayCard
      key={g.id}
      gateway={g}
      buildingLabel={label}
      isAdmin={isAdmin}
      onClick={() => setEditingGateway(g)}
    />
  );
  const renderHanger = (h: Hanger) => (
    <HangerCard
      key={h.id}
      hanger={h}
      zone={h.zoneId ? zoneById.get(h.zoneId) : undefined}
      lowBatteryThreshold={lowBatteryThreshold}
      isStaff={isStaff}
      onClick={() => setEditingHanger(h)}
    />
  );

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Devices</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gateways and hangers across your sites, grouped by building.
          </p>
        </div>
        {isStaff && (
          <button
            onClick={() => setRegistering(true)}
            className="btn-primary whitespace-nowrap"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Register hanger
          </button>
        )}
      </div>

      {totalDevices === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-slate-900 font-medium">No devices yet</div>
          <p className="text-sm text-slate-500 mt-1">
            Plug in a HazardLink gateway and hangers, then add them via the iOS
            app (<em>More → Add a gateway / Add a hanger</em>), or register a
            hanger by DevEUI above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((grp) => {
            const isCollapsed = collapsed.has(grp.key);
            const gwCount = grp.gateways.length;
            const hgCount = grp.hangers.length;
            const offline =
              grp.gateways.filter((g) => !gwOnline(g)).length +
              grp.hangers.filter((h) => h.status === "active" && !hgOnline(h)).length;
            const lowBatt = grp.hangers.filter(hgLowBatt).length;

            return (
              <section
                key={grp.key}
                className="rounded-lg border border-slate-200 bg-white/20 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(grp.key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={
                        "text-slate-500 transition-transform shrink-0 " +
                        (isCollapsed ? "" : "rotate-90")
                      }
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                    <h2 className="font-semibold text-slate-900 truncate">{grp.name}</h2>
                    <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">
                      {gwCount} gateway{gwCount === 1 ? "" : "s"} · {hgCount} hanger{hgCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lowBatt > 0 && (
                      <span className="pill-alert">
                        {lowBatt} low battery
                      </span>
                    )}
                    {offline > 0 ? (
                      <span className="pill-offline">
                        {offline} offline
                      </span>
                    ) : (
                      <span className="pill-online">
                        All online
                      </span>
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="px-4 pb-4 pt-1 space-y-3">
                    {/* Gateways are the building's relay hub(s). */}
                    {grp.gateways.map((g) => renderGateway(g, grp.name))}

                    {/* Same building = connected: hangers relay through the
                        building's gateway, so nest them beneath it with a
                        connector line so the link is obvious. */}
                    {grp.key !== UNASSIGNED && grp.hangers.length > 0 && grp.gateways.length > 0 && (
                      <div className="ml-2 sm:ml-4 pl-4 border-l-2 border-slate-300/70 space-y-3 pt-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                            <polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" />
                          </svg>
                          <span>
                            {grp.hangers.length} hanger{grp.hangers.length === 1 ? "" : "s"} relayed through{" "}
                            {grp.gateways.length === 1 ? "this gateway" : "this building's gateways"}
                          </span>
                        </div>
                        {grp.hangers.map(renderHanger)}
                      </div>
                    )}

                    {/* Hangers present but no gateway in the building to relay them. */}
                    {grp.key !== UNASSIGNED && grp.hangers.length > 0 && grp.gateways.length === 0 && (
                      <>
                        <div className="flex items-center gap-1.5 text-xs text-amber-700">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <span>No gateway in this building — these hangers can't relay until one is added.</span>
                        </div>
                        {grp.hangers.map(renderHanger)}
                      </>
                    )}

                    {/* Unassigned bucket: not tied to a building, so no relay link. */}
                    {grp.key === UNASSIGNED && grp.hangers.map(renderHanger)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ── Modals (reused verbatim from the original pages) ── */}
      {editingHanger && (
        <HangerEditDialog
          hanger={editingHanger}
          buildings={buildings}
          allZones={allZones}
          isAdmin={isAdmin}
          isStaff={isStaff}
          onClose={() => setEditingHanger(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["hangers"] }); setEditingHanger(null); }}
          onStatusChanged={() => { qc.invalidateQueries({ queryKey: ["hangers"] }); setEditingHanger(null); }}
        />
      )}

      {editingGateway && (
        <GatewayEditDialog
          gateway={editingGateway}
          buildings={buildings}
          isAdmin={isAdmin}
          onClose={() => setEditingGateway(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["gateways"] }); setEditingGateway(null); }}
          onRemoved={() => { qc.invalidateQueries({ queryKey: ["gateways"] }); setEditingGateway(null); }}
        />
      )}

      {registering && (
        <RegisterHangerDialog
          buildings={buildings}
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
