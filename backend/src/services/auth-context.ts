/**
 * Standard request context: who is calling and which organisation they belong to.
 * Every authenticated route uses these helpers so we never accidentally leak
 * across orgs.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export interface AuthCtx {
  sub: string;            // user id
  orgId: string;          // organisation_id
  role: typeof schema.userRole.enumValues[number];
  name?: string;
}

export function ctx(req: any): AuthCtx {
  return req.user as AuthCtx;
}

/**
 * True only for a real session token. The two-step sign-in challenge is signed
 * with the same secret and the same sub/orgId/role claims, marked by
 * `chal: "totp"` (and now `typ: "2fa_challenge"`); before this check existed it
 * passed `authenticate` and worked as a full session, which defeated 2FA.
 * Tokens minted before `typ` existed carry neither claim and stay valid.
 */
export function isSessionPayload(p: unknown): p is AuthCtx {
  if (!p || typeof p !== "object") return false;
  const c = p as Record<string, unknown>;
  if (c.chal) return false;
  if (c.typ !== undefined && c.typ !== "session") return false;
  return typeof c.sub === "string" && typeof c.orgId === "string";
}

type ActiveUser = { role: AuthCtx["role"]; orgId: string } | null;
const activeCache = new Map<string, { at: number; v: ActiveUser }>();
const ACTIVE_TTL_MS = 60_000;

/**
 * The user's current standing from the database, cached for a minute per user.
 * Null means deactivated or erased. The role is the live one, so a demotion or
 * a dismissal takes effect within a minute instead of at the next sign-in
 * (sessions used to live for 30 days on the claims they were minted with).
 */
export async function loadActiveUser(sub: string): Promise<ActiveUser> {
  const now = Date.now();
  const hit = activeCache.get(sub);
  if (hit && now - hit.at < ACTIVE_TTL_MS) return hit.v;
  const [row] = await db
    .select({ role: schema.users.role, deactivatedAt: schema.users.deactivatedAt, orgId: schema.users.organisationId })
    .from(schema.users)
    .where(eq(schema.users.id, sub))
    .limit(1);
  const v: ActiveUser = row && !row.deactivatedAt ? { role: row.role, orgId: row.orgId } : null;
  activeCache.set(sub, { at: now, v });
  return v;
}

/** Call after deactivating, erasing or re-roling a user so the change is immediate. */
export function forgetActiveUser(sub: string): void {
  activeCache.delete(sub);
}
