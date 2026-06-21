import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ColumnCard, ColumnRow, ColumnEmpty } from "./parts";

/* ─── CleaningColumn ──────────────────────────────────────────────────────────
 *
 * The cleaning team's right column on the team dashboard:
 *   • On-shift cleaners  — active users (role=cleaner) currently on duty.
 *   • Low consumables    — parts at/below their reorder level.
 *
 * Both come from existing staff endpoints (/users, /parts).
 */

interface UserRow {
  id: string; name: string; role: "admin" | "supervisor" | "cleaner";
  onDuty: boolean; deactivatedAt: string | null;
}
interface Part { id: string; name: string; stockQty: number; reorderLevel: number; unit?: string }

export function CleaningColumn() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: UserRow[] }>("/users"),
    enabled: isStaff,
    refetchInterval: 30_000,
  });
  const partsQ = useQuery({
    queryKey: ["parts"],
    queryFn: () => api<{ parts: Part[] }>("/parts"),
    enabled: isStaff,
  });

  const onShift = useMemo(
    () => (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt && u.onDuty && u.role === "cleaner"),
    [usersQ.data],
  );
  const lowParts = useMemo(
    () => (partsQ.data?.parts ?? []).filter((p) => p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel)),
    [partsQ.data],
  );

  return (
    <div className="space-y-5">
      <ColumnCard title={`On-shift cleaners (${onShift.length})`} to="/users">
        {usersQ.isLoading ? (
          <ColumnEmpty>Loading…</ColumnEmpty>
        ) : onShift.length === 0 ? (
          <ColumnEmpty>No cleaners on duty right now.</ColumnEmpty>
        ) : (
          onShift.slice(0, 8).map((u) => (
            <ColumnRow key={u.id} main={u.name} sub="On duty" tag="On shift" tagClass="pill-online" />
          ))
        )}
      </ColumnCard>

      <ColumnCard title={`Low consumables (${lowParts.length})`} to="/parts">
        {partsQ.isLoading ? (
          <ColumnEmpty>Loading…</ColumnEmpty>
        ) : lowParts.length === 0 ? (
          <ColumnEmpty>Everything's well stocked.</ColumnEmpty>
        ) : (
          lowParts.slice(0, 8).map((p) => (
            <ColumnRow
              key={p.id}
              main={p.name}
              sub={p.stockQty <= 0 ? "Out of stock" : `${p.stockQty} left`}
              tag={p.stockQty <= 0 ? "Out" : "Low"}
              tagClass={p.stockQty <= 0 ? "pill-alert" : "pill-offline"}
            />
          ))
        )}
      </ColumnCard>
    </div>
  );
}

export default CleaningColumn;
