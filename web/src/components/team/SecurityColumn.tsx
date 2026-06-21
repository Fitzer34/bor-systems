import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTicker } from "../../lib/ticker";
import { ColumnCard, ColumnRow, ColumnEmpty } from "./parts";

/* ─── SecurityColumn ──────────────────────────────────────────────────────────
 *
 * The security team's right column:
 *   • Guards on duty     — active users currently on duty.
 *   • Check-ins due      — lone-worker sessions overdue / in alarm / due soon.
 *
 * From the existing /users + /lone-worker/sessions endpoints. A 1s ticker keeps
 * the "overdue / due soon" split accurate between refetches.
 */

interface UserRow {
  id: string; name: string; role: "admin" | "supervisor" | "cleaner";
  onDuty: boolean; deactivatedAt: string | null;
}
interface MonSession {
  id: string; status: "active" | "ended" | "alarm"; userName: string | null;
  nextCheckInDueAt: string | null; alarmReason: string | null;
}

function mmss(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SecurityColumn() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  useTicker(1000);

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[] }>("/users"),
    enabled: isStaff,
    refetchInterval: 30_000,
  });
  const sessionsQ = useQuery({
    queryKey: ["lone-worker-sessions"],
    queryFn: () => api<{ sessions: MonSession[] }>("/lone-worker/sessions"),
    enabled: isStaff,
    refetchInterval: 15_000,
  });

  const onDuty = useMemo(
    () => (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt && u.onDuty),
    [usersQ.data],
  );

  // Sessions needing attention: in alarm, overdue, or due within 5 minutes.
  const checkInsDue = useMemo(() => {
    const now = Date.now();
    return (sessionsQ.data?.sessions ?? [])
      .filter((s) => {
        if (s.status === "alarm") return true;
        if (s.status !== "active" || !s.nextCheckInDueAt) return false;
        return new Date(s.nextCheckInDueAt).getTime() - now <= 5 * 60_000;
      })
      .sort((a, b) => {
        const at = a.status === "alarm" ? -Infinity : new Date(a.nextCheckInDueAt ?? 0).getTime();
        const bt = b.status === "alarm" ? -Infinity : new Date(b.nextCheckInDueAt ?? 0).getTime();
        return at - bt;
      });
  }, [sessionsQ.data]);

  return (
    <div className="space-y-5">
      <ColumnCard title={`Guards on duty (${onDuty.length})`} to="/users">
        {usersQ.isLoading ? (
          <ColumnEmpty>Loading…</ColumnEmpty>
        ) : onDuty.length === 0 ? (
          <ColumnEmpty>Nobody on duty right now.</ColumnEmpty>
        ) : (
          onDuty.slice(0, 8).map((u) => (
            <ColumnRow key={u.id} main={u.name} sub="On duty" tag="On duty" tagClass="pill-online" />
          ))
        )}
      </ColumnCard>

      <ColumnCard title={`Check-ins due (${checkInsDue.length})`} to="/lone-worker">
        {sessionsQ.isLoading ? (
          <ColumnEmpty>Loading…</ColumnEmpty>
        ) : checkInsDue.length === 0 ? (
          <ColumnEmpty>All welfare check-ins are current.</ColumnEmpty>
        ) : (
          checkInsDue.slice(0, 8).map((s) => {
            const alarm = s.status === "alarm";
            const remaining = s.nextCheckInDueAt ? new Date(s.nextCheckInDueAt).getTime() - Date.now() : 0;
            const overdue = !alarm && remaining <= 0;
            return (
              <ColumnRow
                key={s.id}
                main={s.userName ?? "Lone worker"}
                sub={alarm ? (s.alarmReason ?? "Alarm raised") : overdue ? "Check-in overdue" : `Due in ${mmss(remaining)}`}
                tag={alarm ? "Alarm" : overdue ? "Overdue" : "Soon"}
                tagClass={alarm || overdue ? "pill-alert" : "pill-offline"}
              />
            );
          })
        )}
      </ColumnCard>
    </div>
  );
}

export default SecurityColumn;
