import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface StatusResponse {
  ok: boolean;
  service: "up" | "degraded" | "down";
  db: { ok: boolean; latencyMs: number };
  uplinks: { lastSeenAt: string | null; last15min: number };
  version: string;
  time: string;
}

/**
 * In-app system status — what the admin sees when they want to confirm the
 * service is healthy. Backed by the public /status endpoint, so the same
 * data feeds external uptime monitors. Polls every 30 s.
 */
export function Status() {
  const { data, isError, isLoading } = useQuery<StatusResponse>({
    queryKey: ["status"],
    queryFn: () => api.get<StatusResponse>("/status"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (isError || !data) {
    return (
      <Banner severity="down">
        <div className="font-medium">Status unavailable</div>
        <div className="text-sm">We couldn't reach the status endpoint. The backend may be down.</div>
      </Banner>
    );
  }

  const sevLabel: Record<StatusResponse["service"], string> = {
    up: "All systems operational",
    degraded: "Performance degraded",
    down: "Outage in progress",
  };

  const minutesSinceUplink = data.uplinks.lastSeenAt
    ? Math.round((Date.now() - new Date(data.uplinks.lastSeenAt).getTime()) / 60000)
    : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">System status</h1>

      <Banner severity={data.service}>
        <div className="text-lg font-medium">{sevLabel[data.service]}</div>
        <div className="text-sm opacity-80">Updated {formatTime(data.time)}</div>
      </Banner>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Database">
          <Row label="Status" value={data.db.ok ? "Healthy" : "Down"} good={data.db.ok} />
          <Row label="Query latency" value={`${data.db.latencyMs} ms`} good={data.db.latencyMs < 200} />
        </Card>

        <Card title="Device uplinks">
          <Row
            label="Last uplink"
            value={minutesSinceUplink === null ? "—" : `${minutesSinceUplink} min ago`}
            good={minutesSinceUplink !== null && minutesSinceUplink < 60}
          />
          <Row
            label="Events / 15 min"
            value={String(data.uplinks.last15min)}
            good={data.uplinks.last15min > 0}
          />
        </Card>
      </div>

      <div className="text-xs text-slate-400">
        Backend v{data.version} · This page polls /status every 30 s. For an externally-hosted status page, point your StatusPage.io or UptimeRobot monitor at <code>/status</code>.
      </div>
    </div>
  );
}

// ─── Small UI helpers ──────────────────────────────────────────────────────

function Banner({
  severity,
  children,
}: {
  severity: "up" | "degraded" | "down";
  children: React.ReactNode;
}) {
  const cls =
    severity === "up"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : severity === "degraded"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-rose-50 border-rose-200 text-rose-900";
  return <div className={`p-4 rounded-lg border ${cls}`}>{children}</div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border bg-white shadow-sm">
      <div className="text-sm font-medium text-slate-700 mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={good ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"}>{value}</span>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
