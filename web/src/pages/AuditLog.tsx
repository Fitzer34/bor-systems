import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  at: string;
}

export function AuditLog() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => api<{ entries: AuditEntry[] }>("/admin/audit-log?limit=200"),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Audit log</h1>
      <p className="text-sm text-slate-500 mb-6">
        System changes — role assignments, manual closures, decommissions, settings updates, password changes, GDPR
        erasures. Read-only.
      </p>

      {isLoading && <div className="text-slate-500">Loading…</div>}
      {error && <div className="text-red-600">Could not load audit log.</div>}

      {data && (
        <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="p-2">When</th>
              <th className="p-2">Who</th>
              <th className="p-2">Action</th>
              <th className="p-2">Target</th>
              <th className="p-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap text-slate-500">{new Date(e.at).toLocaleString()}</td>
                <td className="p-2">{e.actorName ?? <span className="text-slate-400">system</span>}</td>
                <td className="p-2 font-mono text-xs">{e.action}</td>
                <td className="p-2 font-mono text-xs text-slate-500">
                  {e.targetType ? `${e.targetType}: ${e.targetId ?? ""}` : ""}
                </td>
                <td className="p-2 text-xs text-slate-500">
                  {e.metadata ? <pre className="whitespace-pre-wrap break-all max-w-md">{JSON.stringify(e.metadata)}</pre> : ""}
                </td>
              </tr>
            ))}
            {data.entries.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-400">No audit events yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
