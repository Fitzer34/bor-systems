import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Analytics dashboard — heat map, timeline, responder leaderboard.
 *
 * Powered by backend /analytics/* endpoints. Polls every 30 seconds.
 * Inline SVG sparkline keeps the bundle dependency-free; if richer
 * charting becomes important later, swap in Recharts.
 */

interface HeatmapZone {
  zoneId: string;
  zoneName: string;
  floorName: string;
  buildingId: string;
  spillCount: number;
  avgResponseSeconds: number | null;
}

interface TimelineBucket {
  day: string;
  spillCount: number;
}

interface Responder {
  userId: string;
  userName: string;
  ackCount: number;
  closeCount: number;
  avgResponseSeconds: number | null;
}

export function Analytics() {
  const heatmap = useQuery<{ zones: HeatmapZone[]; days: number }>({
    queryKey: ["analytics-heatmap"],
    queryFn: () => api<{ zones: HeatmapZone[]; days: number }>("/analytics/zone-heatmap?days=30"),
    refetchInterval: 30_000,
  });
  const timeline = useQuery<{ buckets: TimelineBucket[]; days: number }>({
    queryKey: ["analytics-timeline"],
    queryFn: () => api<{ buckets: TimelineBucket[]; days: number }>("/analytics/timeline?days=30"),
    refetchInterval: 30_000,
  });
  const responders = useQuery<{ responders: Responder[] }>({
    queryKey: ["analytics-responders"],
    queryFn: () => api<{ responders: Responder[] }>("/analytics/responders?days=30"),
    refetchInterval: 30_000,
  });

  // Window grows with the account's age for the first 30 days, then settles
  // into the normal rolling 30-day window (the backend caps it; we just label
  // it). So a week-old customer sees a focused "last 7 days" view, not a
  // mostly-empty 30-day chart.
  const windowDays = timeline.data?.days ?? heatmap.data?.days ?? 30;
  const youngAccount = windowDays < 30;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">
          Trends and accountability from the last {windowDays} day{windowDays === 1 ? "" : "s"} of
          spill alerts — how often spills happen, which areas spill most, and who responds fastest.
          {youngAccount
            ? " Your account is new, so this covers everything so far and grows to a rolling 30-day window."
            : " These charts fill in automatically as alerts are raised and closed."}
        </p>
      </div>

      {/* ─── Timeline ─── */}
      <Card title="Daily spills">
        {timeline.isLoading ? (
          <Loading />
        ) : (
          <Sparkline buckets={timeline.data?.buckets ?? []} />
        )}
      </Card>

      {/* ─── Zone heat map ─── */}
      <Card title="Repeat-offender zones">
        <p className="text-xs text-slate-500 mb-3">
          Zones sorted by spill count. Red zones are repeat offenders —
          investigate root cause (leaky equipment, wet entrance, etc.).
        </p>
        {heatmap.isLoading ? (
          <Loading />
        ) : (
          <ZoneList zones={heatmap.data?.zones ?? []} />
        )}
      </Card>

      {/* ─── Responder leaderboard ─── */}
      <Card title="Responder leaderboard">
        <p className="text-xs text-slate-500 mb-3">
          Who's responding to alerts and how fast.
        </p>
        {responders.isLoading ? (
          <Loading />
        ) : (
          <ResponderTable responders={responders.data?.responders ?? []} />
        )}
      </Card>
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800 shadow-sm p-5">
      <h2 className="text-lg font-medium mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Loading() {
  return <div className="text-slate-400 text-sm">Loading…</div>;
}

function Sparkline({ buckets }: { buckets: TimelineBucket[] }) {
  if (buckets.length === 0) {
    return (
      <div className="text-slate-400 text-sm">
        No spills logged in the last 30 days. Once wet-floor signs are lifted and
        alerts are raised, a per-day spill count appears here.
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.spillCount), 1);
  const w = 700;
  const h = 120;
  const barW = w / buckets.length;
  const total = buckets.reduce((s, b) => s + b.spillCount, 0);

  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-700">
        Total: <span className="font-medium">{total}</span> spills
      </div>
      <svg viewBox={`0 0 ${w} ${h + 24}`} className="w-full">
        {buckets.map((b, i) => {
          const barH = (b.spillCount / max) * h;
          const x = i * barW;
          return (
            <g key={b.day}>
              <rect
                x={x + 1}
                y={h - barH}
                width={barW - 2}
                height={barH}
                fill="#f59e0b"
                rx={2}
              />
              <text
                x={x + barW / 2}
                y={h + 14}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: 9 }}
              >
                {/* Just show every 5th day to avoid clutter. */}
                {i % 5 === 0 ? b.day.slice(5) : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ZoneList({ zones }: { zones: HeatmapZone[] }) {
  if (zones.length === 0) {
    return (
      <div className="text-slate-400 text-sm">
        No spill data yet. As spills are logged, the zones where they happen most
        are ranked here so you can target the worst offenders.
      </div>
    );
  }
  const maxCount = Math.max(...zones.map((z) => z.spillCount), 1);
  return (
    <div className="space-y-2">
      {zones.slice(0, 10).map((z) => {
        const intensity = z.spillCount / maxCount;
        const colour = intensity > 0.66 ? "bg-rose-100" :
                       intensity > 0.33 ? "bg-amber-100" :
                       "bg-emerald-50";
        return (
          <div
            key={z.zoneId}
            className={`p-3 rounded ${colour} flex justify-between items-center`}
          >
            <div>
              <div className="font-medium text-sm">{z.zoneName}</div>
              <div className="text-xs text-slate-500">{z.floorName}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-sm">{z.spillCount} spills</div>
              {z.avgResponseSeconds !== null && (
                <div className="text-xs text-slate-500">
                  Avg response {formatDuration(z.avgResponseSeconds)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResponderTable({ responders }: { responders: Responder[] }) {
  if (responders.length === 0) {
    return (
      <div className="text-slate-400 text-sm">
        No responder activity yet. When staff acknowledge and close alerts,
        you'll see who responded, how many they closed, and their average
        response time.
      </div>
    );
  }
  return (
    <div className="table-wrap">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="pb-2">Cleaner</th>
          <th className="pb-2 text-right">Ack</th>
          <th className="pb-2 text-right">Closed</th>
          <th className="pb-2 text-right">Avg response</th>
        </tr>
      </thead>
      <tbody>
        {responders.map((r, i) => (
          <tr key={r.userId} className="border-b border-slate-100">
            <td className="py-2">
              {i === 0 && <span className="mr-1">🥇</span>}
              {i === 1 && <span className="mr-1">🥈</span>}
              {i === 2 && <span className="mr-1">🥉</span>}
              {r.userName}
            </td>
            <td className="py-2 text-right font-medium">{r.ackCount}</td>
            <td className="py-2 text-right">{r.closeCount}</td>
            <td className="py-2 text-right">
              {r.avgResponseSeconds !== null ? formatDuration(r.avgResponseSeconds) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
