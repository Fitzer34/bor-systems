import { db } from "../db/client.js";
import * as schema from "../db/schema.js";

/**
 * Record one line in the organisation's audit log. Fire-and-forget: the
 * audit trail must never break the write it describes, so failures are
 * swallowed after a console warning. Call it AFTER the write succeeds.
 */
export function audit(
  orgId: string,
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>,
): void {
  void db
    .insert(schema.auditLog)
    .values({
      organisationId: orgId,
      actorUserId: actorUserId ?? undefined,
      action,
      targetType,
      targetId: targetId ?? undefined,
      metadata: metadata ?? null,
    })
    .catch((err) => console.warn("audit insert failed", action, err?.message));
}
