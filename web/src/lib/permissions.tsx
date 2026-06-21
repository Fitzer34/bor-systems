import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";

/* ─── Permissions ──────────────────────────────────────────────────────────────
 *
 * The current user's *effective* permissions come from GET /users/me
 * (`permissions: Record<string, boolean>` — module.* + action.* keys; admin has
 * every key true). This provider surfaces them through a `can(key)` helper that
 * the nav + route guards consume, so visibility logic lives in one place.
 *
 * It also offers a CLIENT-SIDE "preview as role" override. An admin on the Roles
 * & permissions page can flip into "see the app as a Supervisor / Field staff"
 * mode: `can()` then answers using that role's *default* permission baseline (or,
 * when the admin is editing the matrix, the in-flight draft for that role), and
 * `previewRole` drives the nav to gate as that role. This NEVER escalates real
 * API rights — the server still checks the user's actual role on every request —
 * it only changes what the UI chooses to show locally. The admin's real session
 * is untouched; clearing the preview restores their own view.
 */

export type Role = "admin" | "supervisor" | "cleaner";

/** Module + action keys, mirrored from the backend catalogue (services/permissions.ts). */
export const PERMISSION_MODULES = [
  "module.operations",
  "module.maintenance",
  "module.compliance",
  "module.business",
  "module.insights",
  "module.admin",
] as const;

export const PERMISSION_ACTIONS = [
  "action.approve_permits",
  "action.approve_quotes",
  "action.edit_compliance",
  "action.manage_devices",
  "action.manage_automations",
  "action.export_reports",
  "action.manage_users",
  "action.manage_billing",
  "action.delete_records",
] as const;

export const ALL_PERMISSION_KEYS: string[] = [...PERMISSION_MODULES, ...PERMISSION_ACTIONS];

function emptyMap(value: boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of ALL_PERMISSION_KEYS) out[k] = value;
  return out;
}

/**
 * Per-role default baselines — a client mirror of DEFAULT_PERMISSIONS on the
 * server. Used only to *preview* what a role would see when an admin hasn't (or
 * before they) supply a real map for the preview. The authoritative maps still
 * come from the server; this is a visual approximation for the preview toggle.
 */
export const DEFAULT_PERMISSIONS: Record<Role, Record<string, boolean>> = {
  admin: emptyMap(true),
  supervisor: {
    ...emptyMap(false),
    "module.operations": true,
    "module.maintenance": true,
    "module.compliance": true,
    "module.business": true,
    "module.insights": true,
    "module.admin": false,
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
    ...emptyMap(false),
    "module.operations": true,
  },
};

interface PermissionsState {
  /** The signed-in user's real effective permissions (from /users/me). */
  real: Record<string, boolean>;
  /** True if `can` is currently answering for a previewed role, not the user. */
  isPreviewing: boolean;
  /** The role currently being previewed (or null when not previewing). */
  previewRole: Role | null;
  /**
   * Permission check. Honours the preview override when active; otherwise uses
   * the real map. Admin (real, not previewed) is always allowed even if a key is
   * somehow missing from the map.
   */
  can: (key: string) => boolean;
  /**
   * Enter preview for a role. `map` lets the caller pass the exact (possibly
   * edited / server-loaded) permission map for that role; when omitted we fall
   * back to the client default baseline. Previewing "admin" clears the preview
   * (admins already see everything).
   */
  previewAs: (role: Role | null, map?: Record<string, boolean>) => void;
  /** Leave preview and return to the user's own view. */
  clearPreview: () => void;
}

const Ctx = createContext<PermissionsState | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [previewRole, setPreviewRole] = useState<Role | null>(null);
  const [previewMap, setPreviewMap] = useState<Record<string, boolean> | null>(null);

  const real = useMemo<Record<string, boolean>>(() => {
    // If the server hasn't sent permissions (older session), derive a safe map
    // from the user's role so nothing is accidentally hidden for admins.
    if (user?.permissions && typeof user.permissions === "object") return user.permissions;
    if (user?.role) return DEFAULT_PERMISSIONS[user.role];
    return {};
  }, [user?.permissions, user?.role]);

  const previewAs = useCallback(
    (role: Role | null, map?: Record<string, boolean>) => {
      // Previewing as admin (or null) just exits preview — admins see all.
      if (role === null || role === "admin") {
        setPreviewRole(null);
        setPreviewMap(null);
        return;
      }
      setPreviewRole(role);
      setPreviewMap(map ?? DEFAULT_PERMISSIONS[role]);
    },
    [],
  );

  const clearPreview = useCallback(() => {
    setPreviewRole(null);
    setPreviewMap(null);
  }, []);

  const can = useCallback(
    (key: string): boolean => {
      if (previewRole && previewMap) {
        // Previewing another role: answer strictly from that role's map.
        return !!previewMap[key];
      }
      // Real session. Admin is always allowed (defensive — server agrees).
      if (user?.role === "admin") return true;
      return !!real[key];
    },
    [previewRole, previewMap, real, user?.role],
  );

  const value = useMemo<PermissionsState>(
    () => ({ real, can, previewAs, clearPreview, previewRole, isPreviewing: previewRole !== null }),
    [real, can, previewAs, clearPreview, previewRole],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePermissions(): PermissionsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("PermissionsProvider missing");
  return ctx;
}
