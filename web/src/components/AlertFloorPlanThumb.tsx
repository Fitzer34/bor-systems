import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

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

  const pinColor = status === "acknowledged" ? "bg-blue-500" : "bg-red-500";

  return (
    <div className="relative w-48 h-32 shrink-0 rounded overflow-hidden bg-slate-100 border border-slate-200">
      <img src={planUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      {otherPinned.map((z) => (
        <div
          key={z.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border border-white shadow"
          style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
        />
      ))}
      {alertedZone && alertedZone.pinX != null && alertedZone.pinY != null && (
        <div
          className={`absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${pinColor} border-2 border-white shadow animate-pulse`}
          style={{ left: `${(alertedZone.pinX / 1000) * 100}%`, top: `${(alertedZone.pinY / 1000) * 100}%` }}
        />
      )}
    </div>
  );
}
