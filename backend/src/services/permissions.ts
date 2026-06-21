/**
 * Staff permissions — module visibility + sensitive-action gating.
 *
 * Two layers:
 *   1. DEFAULT_PERMISSIONS — the per-role baseline shipped with the app.
 *   2. role_permissions table — a per-(org, role) JSON override merged on top of
 *      the defaults at read time (services + DB row via this module).
 *
 * Admin is always treated as fully allowed and is never gated — both in the
 * effective-permissions computation and in the requirePermission preHandler.
 *
 * Keys come in two flavours:
 *   • module.*  — which sections of the app nav a role can see.
 *   • action.*  — sensitive actions a role may perform.
 *
 * These permissions LAYER ON TOP of the existing role gating (requireRole) — they
 * never replace it. A route keeps its requireRole([...]) and additionally checks
 * requirePermission(key) so nothing regresses if an org hasn't tuned anything.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export type Role = typeof schema.userRole.enumValues[number]; // "admin" | "supervisor" | "cleaner"

/**
 * Catalogue of every recognised permission key, grouped the way the app nav is
 * grouped. The PUT /permissions route validates incoming keys against this, and
 * GET /permissions returns it so the UI can render a labelled matrix.
 */
export const PERMISSION_KEYS = {
  modules: [
    "module.operations",  // live alerts, floor plans, dispatch, shifts (cleaning ops)
    "module.maintenance", // work orders, assets, PPMs, contractors, parts
    "module.compliance",  // SDS, certifications, inspections, statutory
    "module.business",    // tenders, quotes, invoicing/cost, contractor admin
    "module.insights",    // analytics, reports, dashboards
    "module.admin",       // settings, users, billing, devices, automations
  ],
  actions: [
    "action.approve_permits",   // approve work permits / job scopes
    "action.approve_quotes",    // award a quote / approve a tender
    "action.edit_compliance",   // edit SDS / certifications / inspection records
    "action.manage_devices",    // register / decommission hangers + gateways
    "action.manage_automations",// configure automation rules / reminder cadences
    "action.export_reports",    // download CSV / PDF exports
    "action.manage_users",      // create / deactivate / delete staff
    "action.manage_billing",    // change plan / billing
    "action.delete_records",    // hard-delete records
  ],
} as const;

/** Flat list of every valid key (modules + actions). */
export const ALL_PERMISSION_KEYS: string[] = [
  ...PERMISSION_KEYS.modules,
  ...PERMISSION_KEYS.actions,
];

function isValidKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

/** Build a permission map with every key set to the same value. */
function allKeys(value: boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = value;
  return out;
}

/**
 * Per-role baselines.
 *   • admin     — everything (also short-circuited as always-allowed below).
 *   • supervisor— most modules + most actions, but NOT manage_users,
 *                 manage_billing or manage_automations.
 *   • cleaner   — "Field staff": operations only, no sensitive actions.
 */
export const DEFAULT_PERMISSIONS: Record<Role, Record<string, boolean>> = {
  admin: allKeys(true),
  supervisor: {
    ...allKeys(false),
    // Modules: everything except the admin section.
    "module.operations": true,
    "module.maintenance": true,
    "module.compliance": true,
    "module.business": true,
    "module.insights": true,
    "module.admin": false,
    // Actions: day-to-day operational approvals + exports, but not the
    // org-governance actions (users / billing / automations).
    "action.approve_permits": true,
    "action.approve_quotes": true,
    "action.edit_compliance": true,
    "action.manage_devices": true,
    "action.manage_automations": false,
    "action.export_reports": true,
    "action.manage_users": false,
    "action.manage_billing": false,
    "action.delete_records": true,
  },
  cleaner: {
    ...allKeys(false),
    // Field staff: the operations section only, no sensitive actions.
    "module.operations": true,
  },
};

/**
 * Effective permissions for a role in an org: defaults overlaid with the stored
 * override row (if any). Admin is always fully allowed.
 */
export async function getPermissions(orgId: string, role: Role): Promise<Record<string, boolean>> {
  if (role === "admin") return allKeys(true);
  const base = { ...DEFAULT_PERMISSIONS[role] };
  const [row] = await db
    .select()
    .from(schema.rolePermissions)
    .where(and(eq(schema.rolePermissions.organisationId, orgId), eq(schema.rolePermissions.role, role)))
    .limit(1);
  if (row?.permissions) {
    for (const [k, v] of Object.entries(row.permissions)) {
      if (isValidKey(k) && typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

/** Effective permissions for all three roles in an org (admin/supervisor/cleaner). */
export async function getAllPermissions(orgId: string): Promise<Record<Role, Record<string, boolean>>> {
  const [admin, supervisor, cleaner] = await Promise.all([
    getPermissions(orgId, "admin"),
    getPermissions(orgId, "supervisor"),
    getPermissions(orgId, "cleaner"),
  ]);
  return { admin, supervisor, cleaner };
}

/**
 * Persist a partial override for a role. Only recognised keys are stored; the
 * stored map fully replaces the previous override row's map (the caller sends
 * the complete desired override). Admin overrides are accepted + stored but have
 * no effect (admin stays always-allowed).
 */
export async function setPermissions(
  orgId: string,
  role: Role,
  partial: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (isValidKey(k) && typeof v === "boolean") clean[k] = v;
  }
  await db
    .insert(schema.rolePermissions)
    .values({ organisationId: orgId, role, permissions: clean })
    .onConflictDoUpdate({
      target: [schema.rolePermissions.organisationId, schema.rolePermissions.role],
      set: { permissions: clean, updatedAt: new Date() },
    });
  return getPermissions(orgId, role);
}

/**
 * Fastify preHandler factory — gate a route on a single permission key. Admin
 * always passes. Anyone else is checked against their effective permissions and
 * gets a 403 if the key resolves false.
 *
 * Layer this AFTER app.authenticate (so req.user is populated) and AFTER any
 * existing requireRole — it adds a finer check, it does not replace role gating.
 */
export function requirePermission(key: string) {
  return async (req: any, reply: any) => {
    const role = req.user?.role as Role | undefined;
    const orgId = req.user?.orgId as string | undefined;
    if (!role || !orgId) return reply.code(401).send({ error: "unauthorized" });
    if (role === "admin") return; // admin is always allowed
    const perms = await getPermissions(orgId, role);
    if (!perms[key]) return reply.code(403).send({ error: "forbidden", permission: key });
  };
}

/**
 * Shared role-gating preHandler factory. Identical to the copy-pasted helper in
 * each route file; exported here so new routes can reuse it instead of
 * re-declaring it. (Existing routes keep their local copy — no churn.)
 */
export function requireRole(allowed: Role[]) {
  return async (req: any, reply: any) => {
    const role = req.user?.role as Role | undefined;
    if (!role || !allowed.includes(role)) return reply.code(403).send({ error: "forbidden" });
  };
}
