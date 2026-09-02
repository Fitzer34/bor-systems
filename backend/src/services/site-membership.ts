import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";

/** Building ids a user is assigned to. Empty = unrestricted (see schema note). */
export async function userSiteIds(orgId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ buildingId: schema.userSites.buildingId })
    .from(schema.userSites)
    .where(and(eq(schema.userSites.organisationId, orgId), eq(schema.userSites.userId, userId)));
  return rows.map((r) => r.buildingId);
}

/**
 * The scope a request should see: null = every site (admins, or users with no
 * assignments), otherwise the list of building ids.
 */
export async function visibleSiteIds(
  orgId: string,
  userId: string,
  role: string,
): Promise<string[] | null> {
  if (role === "admin") return null;
  const ids = await userSiteIds(orgId, userId);
  return ids.length ? ids : null;
}

/**
 * Apply a scope to rows that carry a buildingId. Rows with no building are
 * org-wide (not "another site") and stay visible; rows for other sites go.
 * Used by the list endpoints so membership is enforced on the server, not
 * just tidied up on the client.
 */
export function scopeRows<T extends { buildingId?: string | null }>(rows: T[], scope: string[] | null): T[] {
  if (!scope) return rows;
  return rows.filter((r) => !r.buildingId || scope.includes(r.buildingId));
}

/**
 * Who to tell about something at a building: every active admin, plus the
 * active supervisors/cleaners either assigned to that building or assigned
 * nowhere (unrestricted, matching visibleSiteIds). When the building is
 * unknown, every active user in the wanted roles.
 */
export async function staffForBuilding(
  orgId: string,
  buildingId: string | null,
  roles: Array<"admin" | "supervisor" | "cleaner">,
): Promise<string[]> {
  const staff = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(and(eq(schema.users.organisationId, orgId), inArray(schema.users.role, roles), isNull(schema.users.deactivatedAt)));
  if (!buildingId) return staff.map((s) => s.id);
  const memberships = await db
    .select({ userId: schema.userSites.userId, buildingId: schema.userSites.buildingId })
    .from(schema.userSites)
    .where(eq(schema.userSites.organisationId, orgId));
  const assignedAnywhere = new Set(memberships.map((m) => m.userId));
  const onThisSite = new Set(memberships.filter((m) => m.buildingId === buildingId).map((m) => m.userId));
  return staff
    .filter((s) => s.role === "admin" || onThisSite.has(s.id) || !assignedAnywhere.has(s.id))
    .map((s) => s.id);
}
