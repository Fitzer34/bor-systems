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
  zoneName: string | null;
  floorName: string | null;
}

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

  if (!alert) return <div className="text-slate-500">Alert not in active list (may already be closed). <button className="underline" onClick={() => nav("/")}>Back</button></div>;

  return (
    <div className="max-w-2xl">
      <button onClick={() => nav("/")} className="text-sm text-slate-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold">{alert.floorName ?? "Unknown floor"} — {alert.zoneName ?? "Unassigned"}</h1>
      <div className="mt-1 text-slate-500">Opened {new Date(alert.openedAt).toLocaleString()} · Status: {alert.status}</div>

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
