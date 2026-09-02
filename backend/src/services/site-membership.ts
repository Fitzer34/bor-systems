import { and, eq, inArray } from "drizzle-orm";
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

/** Users (by id) who are assigned to a building, or every staff member when nobody is. */
export async function staffForBuilding(
  orgId: string,
  buildingId: string | null,
  roles: Array<"admin" | "supervisor" | "cleaner">,
): Promise<string[]> {
  const staff = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(and(eq(schema.users.organisationId, orgId), inArray(schema.users.role, roles)));
  if (!buildingId) return staff.map((s) => s.id);
  const members = await db
    .select({ userId: schema.userSites.userId })
    .from(schema.userSites)
    .where(and(eq(schema.userSites.organisationId, orgId), eq(schema.userSites.buildingId, buildingId)));
  const memberIds = new Set(members.map((m) => m.userId));
  // Admins always hear about it; supervisors/cleaners only if on this site (or unassigned anywhere).
  const out: string[] = [];
  for (const s of staff) {
    if (s.role === "admin" || memberIds.has(s.id)) out.push(s.id);
  }
  if (out.length === 0) return staff.map((s) => s.id);
  return out;
}
