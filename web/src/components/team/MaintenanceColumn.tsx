import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ColumnCard, ColumnRow, ColumnEmpty } from "./parts";

/* ─── MaintenanceColumn ───────────────────────────────────────────────────────
 *
 * The maintenance team's right column:
 *   • SLA at risk        — open emergency-priority jobs.
 *   • Awaiting approval  — jobs out to tender, waiting on an award decision.
 *
 * Both derived from the existing /jobs list endpoint.
 */

interface Job { id: string; title: string; status: string; priority?: string; createdAt?: string }

const DONE = new Set(["completed", "cancelled"]);

function relTime(iso?: string): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function MaintenanceColumn() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";

  const jobsQ = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<{ jobs: Job[] }>("/jobs"),
    enabled: isStaff,
    refetchInterval: 60_000,
  });

  const { slaAtRisk, awaitingApproval } = useMemo(() => {
    const jobs = jobsQ.data?.jobs ?? [];
    const open = jobs.filter((j) => !DONE.has(j.status));
    return {
      slaAtRisk: open.filter((j) => j.priority === "emergency"),
      awaitingApproval: open.filter((j) => j.status === "tendering"),
    };
  }, [jobsQ.data]);

  return (
    <div className="space-y-5">
      <ColumnCard title={`SLA at risk (${slaAtRisk.length})`} to="/maintenance">
        {jobsQ.isLoading ? (
          <ColumnEmpty>Loading…</ColumnEmpty>
        ) : slaAtRisk.length === 0 ? (
          <ColumnEmpty>No emergency jobs open.</ColumnEmpty>
        ) : (
          slaAtRisk.slice(0, 8).map((j) => (
            <ColumnRow key={j.id} main={j.title} sub={`Logged ${relTime(j.createdAt)}`} tag="Emergency" tagClass="pill-alert" />
          ))
        )}
      </ColumnCard>

      <ColumnCard title={`Awaiting approval (${awaitingApproval.length})`} to="/maintenance">
        {jobsQ.isLoading ? (
          <ColumnEmpty>Loading…</ColumnEmpty>
        ) : awaitingApproval.length === 0 ? (
          <ColumnEmpty>No quotes waiting on you.</ColumnEmpty>
        ) : (
          awaitingApproval.slice(0, 8).map((j) => (
            <ColumnRow key={j.id} main={j.title} sub="Out to tender" tag="Review" tagClass="pill-offline" />
          ))
        )}
      </ColumnCard>
    </div>
  );
}

export default MaintenanceColumn;
