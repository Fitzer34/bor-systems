import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface AllSettings {
  resolutionMinutes: number;
  ackMinutes: number;
  lowBatteryThreshold: number;
  defaultAudibleAlarm: boolean;
  expectedCleaningMinutes: number;
}

export function Settings() {
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<AllSettings>("/settings"),
  });

  const [resolution, setResolution] = useState("");
  const [ack, setAck] = useState("");
  const [lowBattery, setLowBattery] = useState("");
  const [audibleAlarm, setAudibleAlarm] = useState(false);
  const [cleaning, setCleaning] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!current.data) return;
    setResolution(String(current.data.resolutionMinutes));
    setAck(String(current.data.ackMinutes));
    setLowBattery(String(current.data.lowBatteryThreshold));
    setAudibleAlarm(current.data.defaultAudibleAlarm);
    setCleaning(String(current.data.expectedCleaningMinutes));
  }, [current.data]);

  const onSaved = (label: string) => () => {
    setSavedKey(`${label}@${Date.now()}`);
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const saveResolution = useMutation({
    mutationFn: () => api("/settings/resolution-timer", { method: "PUT", body: JSON.stringify({ minutes: Number(resolution) }) }),
    onSuccess: onSaved("resolution"),
  });
  const saveAck = useMutation({
    mutationFn: () => api("/settings/ack-timer", { method: "PUT", body: JSON.stringify({ minutes: Number(ack) }) }),
    onSuccess: onSaved("ack"),
  });
  const saveLowBattery = useMutation({
    mutationFn: () => api("/settings/low-battery-threshold", { method: "PUT", body: JSON.stringify({ pct: Number(lowBattery) }) }),
    onSuccess: onSaved("low-battery"),
  });
  const saveAudibleAlarm = useMutation({
    mutationFn: () => api("/settings/default-audible-alarm", { method: "PUT", body: JSON.stringify({ enabled: audibleAlarm }) }),
    onSuccess: onSaved("audible-alarm"),
  });
  const saveCleaning = useMutation({
    mutationFn: () => api("/settings/expected-cleaning-time", { method: "PUT", body: JSON.stringify({ minutes: Number(cleaning) }) }),
    onSuccess: onSaved("cleaning"),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card title="Acknowledgement timer" description="If no cleaner taps 'I'm on it' within this many minutes, the alert escalates to all on-duty supervisors via push, SMS, and email.">
        <NumberRow value={ack} onChange={setAck} suffix="minutes" min={1} max={120}
          dirty={current.data ? Number(ack) !== current.data.ackMinutes : false}
          onSave={() => saveAck.mutate()} pending={saveAck.isPending}
          saved={savedKey?.startsWith("ack@") ?? false} />
      </Card>

      <Card title="Expected cleaning time" description="How long a typical clean-up takes. After the cleaner taps 'I'm on it', a reminder push is sent to them after this many minutes asking them to put the sign back on the hanger.">
        <NumberRow value={cleaning} onChange={setCleaning} suffix="minutes" min={1} max={240}
          dirty={current.data ? Number(cleaning) !== current.data.expectedCleaningMinutes : false}
          onSave={() => saveCleaning.mutate()} pending={saveCleaning.isPending}
          saved={savedKey?.startsWith("cleaning@") ?? false} />
      </Card>

      <Card title="Resolution timer" description="If the sign isn't physically replaced on the hanger within this many minutes, the alert is rebroadcast to all on-duty cleaners and (if not already) escalated to supervisors.">
        <NumberRow value={resolution} onChange={setResolution} suffix="minutes" min={1} max={720}
          dirty={current.data ? Number(resolution) !== current.data.resolutionMinutes : false}
          onSave={() => saveResolution.mutate()} pending={saveResolution.isPending}
          saved={savedKey?.startsWith("resolution@") ?? false} />
      </Card>

      <Card title="Low-battery threshold" description="When a hanger's battery drops to this percentage, admins and supervisors get a 'Hanger battery low' notification. Hanger rows go red on the Hangers page.">
        <NumberRow value={lowBattery} onChange={setLowBattery} suffix="%" min={1} max={99}
          dirty={current.data ? Number(lowBattery) !== current.data.lowBatteryThreshold : false}
          onSave={() => saveLowBattery.mutate()} pending={saveLowBattery.isPending}
          saved={savedKey?.startsWith("low-battery@") ?? false} />
      </Card>

      <Card title="Default audible alarm on new hangers" description="Whether the optional buzzer is enabled by default when a new hanger is registered. Existing hangers are unaffected; toggle each one individually on the Hangers page.">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={audibleAlarm} onChange={(e) => setAudibleAlarm(e.target.checked)} />
            <span className="text-sm">{audibleAlarm ? "Enabled" : "Disabled"}</span>
          </label>
          <button
            onClick={() => saveAudibleAlarm.mutate()}
            disabled={current.data ? audibleAlarm === current.data.defaultAudibleAlarm : true}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 disabled:opacity-50 text-sm"
          >
            {saveAudibleAlarm.isPending ? "Saving…" : "Save"}
          </button>
          {savedKey?.startsWith("audible-alarm@") && <span className="text-sm text-green-700">Saved</span>}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="font-medium">{title}</div>
      <p className="text-sm text-slate-500 mt-1 mb-4">{description}</p>
      {children}
    </div>
  );
}

function NumberRow({
  value, onChange, suffix, min, max, dirty, onSave, pending, saved,
}: {
  value: string; onChange: (v: string) => void; suffix: string;
  min: number; max: number; dirty: boolean; onSave: () => void; pending: boolean; saved: boolean;
}) {
  const valid = /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
  return (
    <div className="flex items-end gap-3">
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-3 py-2 w-32"
      />
      <span className="text-sm text-slate-500 mb-2">{suffix}</span>
      <button
        onClick={onSave}
        disabled={!valid || !dirty || pending}
        className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 disabled:opacity-50 text-sm"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && <span className="text-sm text-green-700">Saved</span>}
    </div>
  );
}
