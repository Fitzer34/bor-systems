import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Shift {
  id: string;
  userId: string;
  userName: string | null;
  startsAt: string;
  endsAt: string;
  buildingId: string | null;
  buildingName: string | null;
  floorId: string | null;
  floorName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  notes: string | null;
}
interface UserRow { id: string; name: string; role: "admin" | "supervisor" | "cleaner" }
interface Building { id: string; name: string }
interface Floor { id: string; name: string; buildingId: string }
interface Zone { id: string; name: string; floorId: string }

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString().slice(0, 16);
}
function defaultEnd(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 9);
  return d.toISOString().slice(0, 16);
}

export function Schedule() {
  const qc = useQueryClient();

  const { user } = useAuth();
  // Cleaners get a read-only view filtered to their own shifts so they
  // know where they're meant to be, but can't create/edit/delete.
  const isReadOnly = user?.role === "cleaner";

  const shifts = useQuery({ queryKey: ["shifts"], queryFn: () => api<{ shifts: Shift[] }>("/shifts") });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[] }>("/users"),
    // Backend rejects /users for cleaners; only fetch when staff.
    enabled: !isReadOnly,
  });
  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: () => api<{ buildings: Building[] }>("/buildings"),
    enabled: !isReadOnly,
  });

  // Allow scheduling any active user — admins/supervisors in small orgs
  // often do the rounds themselves, and restricting to role=cleaner makes
  // the form unusable until you've hired your first dedicated cleaner.
  const assignableUsers = (users.data?.users ?? []).filter((u) => !(u as { deactivatedAt?: string | null }).deactivatedAt);

  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(defaultEnd);
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [notes, setNotes] = useState("");

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

  const create = useMutation({
    mutationFn: () =>
      api("/shifts", {
        method: "POST",
        body: JSON.stringify({
          userId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          buildingId: buildingId || null,
          floorId: floorId || null,
          zoneId: zoneId || null,
          notes: notes || null,
        }),
      }),
    onSuccess: () => {
      setUserId(""); setBuildingId(""); setFloorId(""); setZoneId(""); setNotes("");
      setStartsAt(defaultStart()); setEndsAt(defaultEnd());
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/shifts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const valid = userId && startsAt && endsAt && new Date(endsAt) > new Date(startsAt);
  const now = Date.now();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Schedule</h1>
      <p className="text-sm text-slate-500 mb-6">
        {isReadOnly
          ? "Your upcoming shifts. Where you need to be and when."
          : "Assign someone to a shift. The coverage area is optional — leave empty to assign them to the whole site."}
      </p>

      {!isReadOnly && (
      <div className="bg-white border rounded-lg p-4 mb-8">
        <div className="font-medium mb-3">New shift</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Assigned to</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="border rounded px-3 py-2 w-full">
              <option value="">— pick someone —</option>
              {assignableUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
            </select>
          </div>
          <div></div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Starts</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ends</label>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Building (optional)</label>
            <select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setFloorId(""); setZoneId(""); }} className="border rounded px-3 py-2 w-full">
              <option value="">— whole site —</option>
              {buildings.data?.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Floor (optional)</label>
            <select value={floorId} disabled={!buildingId} onChange={(e) => { setFloorId(e.target.value); setZoneId(""); }} className="border rounded px-3 py-2 w-full disabled:bg-slate-100">
              <option value="">— whole building —</option>
              {floors.data?.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Zone (optional)</label>
            <select value={zoneId} disabled={!floorId} onChange={(e) => setZoneId(e.target.value)} className="border rounded px-3 py-2 w-full disabled:bg-slate-100">
              <option value="">— whole floor —</option>
              {zones.data?.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. focus on toilets" className="border rounded px-3 py-2 w-full" />
          </div>
          <div className="col-span-2">
            <button
              onClick={() => create.mutate()}
              disabled={!valid || create.isPending}
              className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {create.isPending ? "Adding…" : "Add shift"}
            </button>
          </div>
        </div>
      </div>
      )}

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="p-2">Cleaner</th>
            <th className="p-2">Starts</th>
            <th className="p-2">Ends</th>
            <th className="p-2">Coverage</th>
            <th className="p-2">Notes</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(shifts.data?.shifts ?? [])
            .filter((s) => !isReadOnly || s.userId === user?.id)
            .map((s) => {
            const start = new Date(s.startsAt).getTime();
            const end = new Date(s.endsAt).getTime();
            const status = end < now ? "past" : start <= now ? "now" : "upcoming";
            const coverage = [s.buildingName, s.floorName, s.zoneName].filter(Boolean).join(" / ") || "Whole site";
            return (
              <tr key={s.id} className={`border-t ${status === "now" ? "bg-green-50" : status === "past" ? "text-slate-400" : ""}`}>
                <td className="p-2">
                  {s.userName ?? "deleted"}
                  {status === "now" && <span className="ml-2 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs">on now</span>}
                </td>
                <td className="p-2 whitespace-nowrap">{new Date(s.startsAt).toLocaleString()}</td>
                <td className="p-2 whitespace-nowrap">{new Date(s.endsAt).toLocaleString()}</td>
                <td className="p-2">{coverage}</td>
                <td className="p-2 text-slate-500">{s.notes ?? ""}</td>
                <td className="p-2 text-right">
                  {!isReadOnly && (
                    <button onClick={() => { if (confirm("Delete this shift?")) remove.mutate(s.id); }} className="text-red-600 hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            );
          })}
          {shifts.data?.shifts.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-slate-400">No shifts scheduled.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
