import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../lib/api";

interface ActiveAlert {
  id: string;
  hangerId: string;
  status: "open" | "acknowledged" | "closed";
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  zoneId: string | null;
  zoneName: string | null;
  floorId: string | null;
  floorName: string | null;
}

interface Floor { id: string; name: string; buildingId: string; floorPlanUrl: string | null; orderIndex: number }
interface Zone { id: string; name: string; floorId: string; pinX: number | null; pinY: number | null }

export function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });
  const alert = data?.alerts.find((a) => a.id === id);

  const floor = useQuery({
    queryKey: ["floor", alert?.floorId],
    enabled: !!alert?.floorId,
    queryFn: () => api<{ floor: Floor }>(`/floors/${alert!.floorId}`),
  });
  const zones = useQuery({
    queryKey: ["zones", alert?.floorId],
    enabled: !!alert?.floorId,
    queryFn: () => api<{ zones: Zone[] }>(`/floors/${alert!.floorId}/zones`),
  });

  const ack = useMutation({
    mutationFn: () => api(`/alerts/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-alerts"] }),
  });

  const close = useMutation({
    mutationFn: (reason: "sign_damaged" | "sign_missing" | "manual") =>
      api(`/alerts/${id}/close`, { method: "POST", body: JSON.stringify({ reason, note: note || undefined }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      nav("/");
    },
  });

  if (!alert) {
    return (
      <div className="text-slate-500">
        Alert not in active list (may already be closed).{" "}
        <button className="underline" onClick={() => nav("/")}>Back</button>
      </div>
    );
  }

  const planUrl = floor.data?.floor.floorPlanUrl ?? null;
  const alertedZone = zones.data?.zones.find((z) => z.id === alert.zoneId) ?? null;
  const otherPinnedZones = (zones.data?.zones ?? []).filter(
    (z) => z.id !== alert.zoneId && z.pinX != null && z.pinY != null,
  );

  return (
    <div className="max-w-3xl">
      <button onClick={() => nav("/")} className="text-sm text-slate-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold">
        {alert.floorName ?? "Unknown floor"} — {alert.zoneName ?? "Unassigned"}
      </h1>
      <div className="mt-1 text-slate-500">
        Opened {new Date(alert.openedAt).toLocaleString()} · Status: {alert.status}
      </div>

      <div className="mt-6 bg-white border rounded-lg p-4">
        <div className="font-medium mb-3">Location</div>
        {planUrl ? (
          <div className="relative inline-block">
            <img src={planUrl} alt="" className="block max-w-full max-h-[480px]" />
            {otherPinnedZones.map((z) => (
              <div
                key={z.id}
                title={z.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow"
                style={{ left: `${(z.pinX! / 1000) * 100}%`, top: `${(z.pinY! / 1000) * 100}%` }}
              />
            ))}
            {alertedZone && alertedZone.pinX != null && alertedZone.pinY != null && (
              <>
                <div
                  title={`${alertedZone.name} — ALERT`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-red-500 border-2 border-white shadow animate-pulse"
                  style={{ left: `${(alertedZone.pinX / 1000) * 100}%`, top: `${(alertedZone.pinY / 1000) * 100}%` }}
                />
                <div
                  className="absolute -translate-x-1/2 mt-1 px-2 py-0.5 rounded bg-red-600 text-white text-xs font-medium whitespace-nowrap"
                  style={{ left: `${(alertedZone.pinX / 1000) * 100}%`, top: `calc(${(alertedZone.pinY / 1000) * 100}% + 18px)` }}
                >
                  {alertedZone.name}
                </div>
              </>
            )}
          </div>
        ) : alertedZone && alertedZone.pinX == null ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            No pin placed for <strong>{alertedZone.name}</strong> on this floor's plan yet. Go to{" "}
            <button onClick={() => nav("/floor-plans")} className="underline">Floor plans</button> to place it.
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            No floor plan uploaded for <strong>{alert.floorName}</strong> yet. The alert is in zone{" "}
            <strong>{alert.zoneName}</strong>.
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {alert.status === "open" && (
          <button
            onClick={() => ack.mutate()}
            disabled={ack.isPending}
            className="w-full bg-blue-600 text-white rounded py-3 font-medium disabled:opacity-50"
          >
            {ack.isPending ? "…" : "I'm on it"}
          </button>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (logged with closure)…"
          className="w-full border rounded px-3 py-2 text-sm"
          rows={3}
        />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => close.mutate("sign_damaged")} disabled={close.isPending}
            className="rounded border border-amber-500 text-amber-700 py-2 hover:bg-amber-50">
            Sign damaged
          </button>
          <button onClick={() => close.mutate("sign_missing")} disabled={close.isPending}
            className="rounded border border-red-500 text-red-700 py-2 hover:bg-red-50">
            Sign missing
          </button>
        </div>
        <button onClick={() => close.mutate("manual")} disabled={close.isPending}
          className="w-full text-sm text-slate-500 hover:text-slate-900 py-2">
          Manually close (requires note)
        </button>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        The alert auto-closes when the sign is physically replaced on the hanger.
      </p>
    </div>
  );
}
