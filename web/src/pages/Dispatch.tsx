import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface UserRow { id: string; name: string; role: "admin" | "supervisor" | "cleaner"; onDuty: boolean; deactivatedAt: string | null }
interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string }
interface Zone { id: string; name: string; floorId: string }
interface DispatchRow {
  id: string;
  recipientUserId: string;
  recipientName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  message: string;
  status: "sent" | "acknowledged" | "completed";
  sentAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
}

export function Dispatch() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: UserRow[] }>("/users") });
  const buildings = useQuery({ queryKey: ["buildings"], queryFn: () => api<{ buildings: Building[] }>("/buildings") });
  const dispatches = useQuery({
    queryKey: ["dispatches"],
    queryFn: () => api<{ dispatches: DispatchRow[] }>("/dispatches"),
    refetchInterval: 10_000,
  });

  const cleaners = (users.data?.users ?? []).filter((u) => u.role === "cleaner" && !u.deactivatedAt);

  const [recipientUserId, setRecipientUserId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [message, setMessage] = useState("");
  const [alsoSms, setAlsoSms] = useState(false);
  const [sentBanner, setSentBanner] = useState<string | null>(null);

  const floors = useQuery({
    queryKey: ["floors", buildingId],
    enabled: !!buildingId,
    queryFn: () => api<{ floors: Floor[] }>(`/buildings/${buildingId}/floors`),
  });
  const zones = useQuery({
    queryKey: ["zones", floorId],
    enabled: !!floorId,
    queryFn: () => api<{ zones: Zone[] }>(`/floors/${floorId}/zones`),
  });

  const send = useMutation({
    mutationFn: () =>
      api("/dispatches", {
        method: "POST",
        body: JSON.stringify({
          recipientUserId,
          zoneId: zoneId || null,
          message,
          alsoSms,
        }),
      }),
    onSuccess: () => {
      const recipient = cleaners.find((c) => c.id === recipientUserId)?.name ?? "cleaner";
      setSentBanner(`Sent to ${recipient}.`);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["dispatches"] });
      setTimeout(() => setSentBanner(null), 4000);
    },
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => api(`/dispatches/${id}/complete`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dispatches"] }),
  });

  const valid = recipientUserId && message.trim().length > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Dispatch a cleaner</h1>
      <p className="text-sm text-slate-500 mb-6">
        Send a specific cleaner directly to a zone with a custom message. They get a push notification immediately.
        Use this for tasks outside the spill-alert flow (planned cleans, manager requests, escorting visitors).
      </p>

      <div className="bg-white border rounded-lg p-4 mb-8">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cleaner</label>
            <select value={recipientUserId} onChange={(e) => setRecipientUserId(e.target.value)} className="border rounded px-3 py-2 w-full">
              <option value="">— pick a cleaner —</option>
              {cleaners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.onDuty ? " (on duty)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div></div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Building (optional)</label>
            <select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setFloorId(""); setZoneId(""); }} className="border rounded px-3 py-2 w-full">
              <option value="">—</option>
              {buildings.data?.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Floor (optional)</label>
            <select value={floorId} disabled={!buildingId} onChange={(e) => { setFloorId(e.target.value); setZoneId(""); }} className="border rounded px-3 py-2 w-full disabled:bg-slate-100">
              <option value="">—</option>
              {floors.data?.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Zone (optional)</label>
            <select value={zoneId} disabled={!floorId} onChange={(e) => setZoneId(e.target.value)} className="border rounded px-3 py-2 w-full disabled:bg-slate-100">
              <option value="">—</option>
              {zones.data?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500}
              placeholder="e.g. Please bring a mop and check the toilets on Floor 2."
              className="border rounded px-3 py-2 w-full" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoSms} onChange={(e) => setAlsoSms(e.target.checked)} />
              Also send SMS (uses Twilio if configured)
            </label>
            <button
              onClick={() => send.mutate()}
              disabled={!valid || send.isPending}
              className="ml-auto bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {send.isPending ? "Sending…" : "Send dispatch"}
            </button>
          </div>
          {sentBanner && <div className="col-span-2 text-sm text-green-700">{sentBanner}</div>}
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-2">Recent dispatches</h2>
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="p-2">Sent</th>
            <th className="p-2">Cleaner</th>
            <th className="p-2">Zone</th>
            <th className="p-2">Message</th>
            <th className="p-2">Status</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {dispatches.data?.dispatches.map((d) => (
            <tr key={d.id} className="border-t align-top">
              <td className="p-2 whitespace-nowrap text-slate-500">{new Date(d.sentAt).toLocaleString()}</td>
              <td className="p-2">{d.recipientName ?? "deleted"}</td>
              <td className="p-2">{d.zoneName ?? "—"}</td>
              <td className="p-2">{d.message}</td>
              <td className="p-2">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  d.status === "sent" ? "bg-amber-100 text-amber-700" :
                  d.status === "acknowledged" ? "bg-blue-100 text-blue-700" :
                  "bg-green-100 text-green-700"
                }`}>{d.status}</span>
              </td>
              <td className="p-2 text-right">
                {d.status !== "completed" && (
                  <button onClick={() => completeMut.mutate(d.id)} className="text-slate-500 hover:underline">Mark complete</button>
                )}
              </td>
            </tr>
          ))}
          {dispatches.data?.dispatches.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-slate-400">No dispatches yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
