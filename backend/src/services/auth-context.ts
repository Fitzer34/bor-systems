/**
 * Standard request context: who is calling and which organisation they belong to.
 * Every authenticated route uses these helpers so we never accidentally leak
 * across orgs.
 */

import type { schema } from "../db/client.js";

export interface AuthCtx {
  sub: string;            // user id
  orgId: string;          // organisation_id
  role: typeof schema.userRole.enumValues[number];
  name?: string;
}

export function ctx(req: any): AuthCtx {
  return req.user as AuthCtx;
}
