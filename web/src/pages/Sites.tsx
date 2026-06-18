import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useTicker } from "../lib/ticker";

/**
 * Multi-site rollup — designed for cleaning companies managing many
 * customer buildings. Shows one row per building, sorted by open alerts.
 *
 * Companion to backend /sites/summary endpoint. Polls every 5 seconds for
 * near-real-time numbers without spamming.
 */

interface SiteSummary {
  buildingId: string;
  buildingName: string;
  hangerCount: number;
  onlineCount: number;
  lowBatteryCount: number;
  openAlerts: number;
  thirtyDaySpills: number;
  avgResponseSeconds: number | null;
}

export function Sites() {
  useTicker(1000); // re-render every second so relative times stay fresh

  const { data, isLoading, isError } = useQuery<{ sites: SiteSummary[] }>({
    queryKey: ["sites-summary"],
    queryFn: () => api<{ sites: SiteSummary[] }>("/sites/summary"),
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (isError || !data) {
    return <div className="text-red-600">Could not load sites.</div>;
  }

  const totalOpenAlerts = data.sites.reduce((sum, s) => sum + s.openAlerts, 0);
  const totalSpills30d  = data.sites.reduce((sum, s) => sum + s.thirtyDaySpills, 0);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Sites overview</h1>
        <div className="text-sm text-slate-500">
          {data.sites.length} buildings · {totalOpenAlerts} open alerts · {totalSpills30d} spills in last 30 days
        </div>
      </div>

      {data.sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-slate-900 font-medium">No buildings yet</div>
          <div className="text-slate-500 text-sm mt-1">Add one under Floor plans.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.sites.map((s) => (
            <SiteCard key={s.buildingId} site={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteCard({ site }: { site: SiteSummary }) {
  const onlinePct = site.hangerCount > 0
    ? Math.round((site.onlineCount / site.hangerCount) * 100)
    : 0;
  const needsAttention = site.openAlerts > 0 || site.lowBatteryCount > 0 || onlinePct < 80;

  return (
    <Link
      to={`/floor-plans?building=${site.buildingId}`}
      className={
        "card card-hover block " +
        (needsAttention ? "border-amber-300" : "")
      }
    >
      <div className="flex items-start justify-between">
        <div className="font-medium text-slate-900">{site.buildingName}</div>
        {site.openAlerts > 0 && (
          <span className="pill-alert">
            {site.openAlerts} open
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3 text-sm">
        <Stat
          label="Hangers"
          value={`${site.onlineCount}/${site.hangerCount} online`}
          good={onlinePct >= 80}
        />
        <Stat
          label="Low battery"
          value={String(site.lowBatteryCount)}
          good={site.lowBatteryCount === 0}
        />
        <Stat
          label="30-day spills"
          value={String(site.thirtyDaySpills)}
          good={true}
        />
      </div>

      {site.avgResponseSeconds !== null && (
        <div className="mt-2 text-xs text-slate-500">
          Avg response: {formatDuration(site.avgResponseSeconds)}
        </div>
      )}
    </Link>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={"text-sm font-medium mt-0.5 " + (good ? "text-emerald-700" : "text-amber-700")}>
        {value}
      </div>
    </div>
  );
}

function formatDuration(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}h ${m}m`;
}
