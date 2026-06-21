import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { SensorPin } from "./SensorPin";

interface Floor { id: string; name: string; floorPlanUrl: string | null }
interface Zone { id: string; name: string; pinX: number | null; pinY: number | null }

export function AlertFloorPlanThumb({
  floorId,
  alertedZoneId,
  status,
}: {
  floorId: string | null;
  alertedZoneId: string | null;
  status: "open" | "acknowledged" | "closed";
}) {
  const floor = useQuery({
    queryKey: ["floor", floorId],
    enabled: !!floorId,
    queryFn: () => api<{ floor: Floor }>(`/floors/${floorId}`),
  });
  const zones = useQuery({
    queryKey: ["zones", floorId],
    enabled: !!floorId,
    queryFn: () => api<{ zones: Zone[] }>(`/floors/${floorId}/zones`),
  });

  if (!floorId) return null;
  const planUrl = floor.data?.floor.floorPlanUrl;
  if (!planUrl) return null;

  const alertedZone = zones.data?.zones.find((z) => z.id === alertedZoneId) ?? null;
  const otherPinned = (zones.data?.zones ?? []).filter(
    (z) => z.id !== alertedZoneId && z.pinX != null && z.pinY != null,
  );

  // The alerted zone reflects the alert lifecycle; everything else reads OK.
  // Reuses SensorPin so this thumbnail matches the main plan + overview.
  const alertedState = status === "acknowledged" ? "cleaning" : "alert";

  return (
    <div className="relative w-48 h-32 shrink-0 rounded overflow-hidden bg-slate-100 border border-slate-200">
      <img src={planUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      {otherPinned.map((z) => (
        <SensorPin
          key={z.id}
          state="ok"
          label={z.name}
          size={12}
          style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
        />
      ))}
      {alertedZone && alertedZone.pinX != null && alertedZone.pinY != null && (
        <SensorPin
          state={alertedState}
          label={alertedZone.name}
          size={18}
          style={{ left: `${(alertedZone.pinX / 1000) * 100}%`, top: `${(alertedZone.pinY / 1000) * 100}%` }}
        />
      )}
    </div>
  );
}
