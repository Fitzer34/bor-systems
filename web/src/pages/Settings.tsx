import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface ResolutionTimer { minutes: number; default: number }

export function Settings() {
  const qc = useQueryClient();
  const [minutes, setMinutes] = useState<string>("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const current = useQuery({
    queryKey: ["resolution-timer"],
    queryFn: () => api<ResolutionTimer>("/settings/resolution-timer"),
  });

  useEffect(() => {
    if (current.data && minutes === "") setMinutes(String(current.data.minutes));
  }, [current.data, minutes]);

  const save = useMutation({
    mutationFn: () =>
      api<ResolutionTimer>("/settings/resolution-timer", {
        method: "PUT",
        body: JSON.stringify({ minutes: Number(minutes) }),
      }),
    onSuccess: () => {
      setSavedAt(new Date());
      setErr(null);
      qc.invalidateQueries({ queryKey: ["resolution-timer"] });
    },
    onError: () => setErr("Could not save. Must be a positive number of minutes (max 720)."),
  });

  const valid = /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 720;
  const dirty = current.data && Number(minutes) !== current.data.minutes;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="bg-white border rounded-lg p-6">
        <div className="font-medium mb-1">Resolution timer</div>
        <p className="text-sm text-slate-500 mb-4">
          If a sign isn't physically replaced on the hanger within this many minutes, the alert is
          rebroadcast to all on-duty cleaners and escalated to supervisors via push, SMS, and email.
        </p>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Minutes</label>
            <input
              type="number"
              min={1}
              max={720}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="border rounded px-3 py-2 w-32"
            />
          </div>
          <button
            onClick={() => save.mutate()}
            disabled={!valid || !dirty || save.isPending}
            className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          {current.data && (
            <span className="text-xs text-slate-400">Default: {current.data.default} min</span>
          )}
        </div>

        {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
        {savedAt && !err && (
          <div className="text-sm text-green-700 mt-3">Saved at {savedAt.toLocaleTimeString()}.</div>
        )}
      </div>
    </div>
  );
}
