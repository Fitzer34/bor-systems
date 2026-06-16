import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, getToken } from "../lib/api";

interface Spill {
  alertId: string;
  openedAt: string;
  acknowledgedAt: string | null;
  closedAt: string | null;
  closureReason: string | null;
  zoneName: string | null;
  floorName: string | null;
  buildingName: string | null;
  responseSeconds: number | null;
  resolutionSeconds: number | null;
}

export function Reports() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const params = new URLSearchParams({
    from: new Date(from).toISOString(),
    to: new Date(`${to}T23:59:59Z`).toISOString(),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["report-spills", params],
    queryFn: () => api<{ count: number; spills: Spill[] }>(`/reports/spills?${params}`),
  });

  const downloadCsv = () => {
    const url = `/api/reports/spills.csv?${params}`;
    fetch(url, { headers: { authorization: `Bearer ${getToken() ?? ""}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `spills-${from}-to-${to}.csv`;
        a.click();
      });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Reports</h1>
      <div className="bg-white border rounded-lg p-4 mb-6 flex gap-4 items-end">
        <div>
          <label className="block text-xs text-slate-500">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs text-slate-500">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <button onClick={downloadCsv} className="ml-auto bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm">Download CSV</button>
      </div>

      {isLoading && <div className="text-slate-500">Loading…</div>}
      {data && (
        <>
          <div className="text-sm text-slate-600 mb-3">{data.count} spill{data.count === 1 ? "" : "s"} in range</div>
          <div className="table-wrap">
          <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="p-2">Opened</th>
                <th className="p-2">Building / Floor / Zone</th>
                <th className="p-2">Response</th>
                <th className="p-2">Resolution</th>
                <th className="p-2">Closure</th>
              </tr>
            </thead>
            <tbody>
              {data.spills.map((s) => (
                <tr key={s.alertId} className="border-t">
                  <td className="p-2">{new Date(s.openedAt).toLocaleString()}</td>
                  <td className="p-2">{[s.buildingName, s.floorName, s.zoneName].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="p-2">{fmtSeconds(s.responseSeconds)}</td>
                  <td className="p-2">{fmtSeconds(s.resolutionSeconds)}</td>
                  <td className="p-2">{s.closureReason ?? (s.closedAt ? "closed" : "open")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}

function fmtSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
