import { useMemo } from "react";
import { useAuth } from "./auth";
import { useSection, type Section } from "./section";
import { usePermissions } from "./permissions";

/* ─── Navigation: single source of truth ──────────────────────────────────────
 *
 * Every navigable destination in the app is declared once here. The sidebar
 * (Layout.tsx) and the ⌘K command palette (CommandPalette.tsx) both render from
 * this list, so the two can never drift apart again.
 *
 * An entry is shown to a user only when it passes every gate that applies:
 *   • role       — which roles may ever see it (omit = everyone).
 *   • permission — a module/action key from /users/me permissions (omit = no
 *                  permission gate). Admin always passes (permissions are all
 *                  true for admin server-side, and we treat admin as allowed).
 *   • sections   — which discipline sides it belongs to (omit = all sides).
 *
 * Pinned entries sit at the top of the sidebar, outside any group. Everything
 * else belongs to exactly one collapsible group.
 */

export type Role = "admin" | "supervisor" | "cleaner";

/** Ordered group keys. "pinned" is the synthetic group for top-level items. */
export type NavGroup =
  | "Operations"
  | "Maintenance"
  | "Compliance & safety"
  | "Business"
  | "Insights"
  | "Admin";

/** Display order for the accordion groups in the sidebar. */
export const NAV_GROUP_ORDER: NavGroup[] = [
  "Operations",
  "Maintenance",
  "Compliance & safety",
  "Business",
  "Insights",
  "Admin",
];

export interface NavEntry {
  /** Stable key (used for React keys + persisting open groups is by group). */
  key: string;
  label: string;
  to: string;
  /** Inline icon — small SVG sized for the dark sidebar. */
  icon: JSX.Element;
  /** Group this lives under. Pinned items use group "Operations" only for type
   *  completeness but are surfaced via `pinned` and never rendered in a group. */
  group: NavGroup;
  /** Pinned items render at the top, outside any accordion group. */
  pinned?: boolean;
  /** Visibility gates — all that are present must pass. */
  requires?: {
    role?: Role[];
    /** A single permission key (module.* or action.*). */
    permission?: string;
    /** Discipline sides this belongs to. Omit = visible on every side. */
    sections?: Section[];
  };
  /** `end` for NavLink exact matching (used by the "/" Dashboard link). */
  end?: boolean;
}

/* ── Inline icons (no icon-library dependency; matches the existing sidebar) ── */
const ic = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
  ),
  spark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  chip: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
  building: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" /></svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
  ),
  calendar: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  ),
  map: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
  ),
  wrench: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 17l3 3 5.5-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.1-.5-.5-2.1 2.7-2.5z" /></svg>
  ),
  box: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" /></svg>
  ),
  gauge: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 14 17 9" /><path d="M5.5 18a9 9 0 1 1 13 0" /></svg>
  ),
  cog: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
  ),
  badge: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /><path d="M8.2 13.6 7 22l5-3 5 3-1.2-8.4" /></svg>
  ),
  clipboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 2h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12l2 2 4-4" /></svg>
  ),
  doc: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>
  ),
  qr: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="3" y1="21" x2="21" y2="21" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="6" width="3" height="12" /><rect x="16" y="14" width="3" height="4" /></svg>
  ),
  report: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 16v-3M12 16v-5M16 16v-2" /></svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>
  ),
  lock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  ),
  bell: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
  ),
  list: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
  ),
  pulse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  ),
  person: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  ),
  solo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M6 21v-1a6 6 0 0 1 12 0v1" /><path d="M19 4l2 2-2 2" /></svg>
  ),
};

const STAFF: Role[] = ["admin", "supervisor"];

/**
 * The full catalogue. Order within a group is the order shown in the sidebar.
 * Every route mounted in main.tsx that a human navigates to is mapped here.
 */
export const NAV_ENTRIES: NavEntry[] = [
  // ── Pinned (top, no group) ──────────────────────────────────────────────
  { key: "dashboard", label: "Dashboard", to: "/", end: true, icon: ic.dashboard, group: "Operations", pinned: true },
  { key: "assistant", label: "Ask HazardLink", to: "/assistant", icon: ic.spark, group: "Operations", pinned: true, requires: { role: STAFF } },
  { key: "devices", label: "Devices", to: "/devices", icon: ic.chip, group: "Operations", pinned: true, requires: { role: STAFF, permission: "action.manage_devices" } },

  // ── Operations (cleaning IoT spill-safety + scheduling/dispatch) ─────────
  { key: "sites", label: "Sites overview", to: "/sites", icon: ic.building, group: "Operations", requires: { role: STAFF, permission: "module.operations", sections: ["cleaning"] } },
  { key: "dispatch", label: "Dispatch", to: "/dispatch", icon: ic.send, group: "Operations", requires: { permission: "module.operations", sections: ["cleaning"] } },
  { key: "schedule", label: "Schedule", to: "/schedule", icon: ic.calendar, group: "Operations", requires: { permission: "module.operations", sections: ["cleaning"] } },
  { key: "floor-plans", label: "Floor plans", to: "/floor-plans", icon: ic.map, group: "Operations", requires: { role: ["admin"], permission: "module.operations", sections: ["cleaning"] } },

  // ── Maintenance (CMMS / FM) ─────────────────────────────────────────────
  { key: "maintenance-dashboard", label: "Maintenance dashboard", to: "/maintenance-dashboard", icon: ic.dashboard, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },
  { key: "maintenance", label: "Jobs", to: "/maintenance", icon: ic.wrench, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },
  { key: "assets", label: "Assets", to: "/assets", icon: ic.box, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },
  { key: "meters", label: "Meters", to: "/meters", icon: ic.gauge, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },
  { key: "parts", label: "Parts", to: "/parts", icon: ic.cog, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },
  { key: "ppms", label: "PPMs", to: "/ppms", icon: ic.calendar, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },
  { key: "competency", label: "Competency", to: "/competency", icon: ic.badge, group: "Maintenance", requires: { role: STAFF, permission: "module.maintenance", sections: ["maintenance"] } },

  // ── Compliance & safety ─────────────────────────────────────────────────
  // Inspections + SDS are front-line safety tools every role uses (matching the
  // pre-existing all-roles access), so they're gated by the operations module
  // that field staff hold — not the compliance module — even though they live in
  // the Compliance & safety group. SDS is reachable from every discipline side.
  { key: "inspections", label: "Inspections", to: "/inspections", icon: ic.clipboard, group: "Compliance & safety", requires: { permission: "module.operations", sections: ["cleaning"] } },
  { key: "sds", label: "Safety data sheets", to: "/sds", icon: ic.doc, group: "Compliance & safety" },
  { key: "incidents", label: "Incidents", to: "/incidents", icon: ic.alert, group: "Compliance & safety", requires: { role: STAFF, permission: "module.compliance", sections: ["security"] } },
  { key: "checkpoints", label: "Checkpoints", to: "/checkpoints", icon: ic.qr, group: "Compliance & safety", requires: { role: STAFF, permission: "module.compliance", sections: ["cleaning", "security"] } },
  { key: "lone-worker", label: "Lone worker", to: "/lone-worker", icon: ic.solo, group: "Compliance & safety" },

  // ── Insights ────────────────────────────────────────────────────────────
  // Personal notifications feed (per-user; every role has one). Distinct from
  // the Admin "Notifications" entry below, which is the org-wide delivery log.
  { key: "notifications", label: "Notifications", to: "/notifications", icon: ic.bell, group: "Insights" },
  { key: "analytics", label: "Analytics", to: "/analytics", icon: ic.chart, group: "Insights", requires: { role: STAFF, permission: "module.insights", sections: ["cleaning"] } },
  { key: "maintenance-kpis", label: "Maintenance KPIs", to: "/maintenance-kpis", icon: ic.pulse, group: "Insights", requires: { role: STAFF, permission: "module.insights", sections: ["maintenance"] } },
  { key: "reports", label: "Reports", to: "/reports", icon: ic.report, group: "Insights", requires: { role: STAFF, permission: "module.insights", sections: ["cleaning"] } },

  // ── Admin (org governance) ──────────────────────────────────────────────
  { key: "users", label: "Users", to: "/users", icon: ic.users, group: "Admin", requires: { role: STAFF, permission: "module.admin" } },
  { key: "roles", label: "Roles & permissions", to: "/roles", icon: ic.lock, group: "Admin", requires: { role: ["admin"], permission: "module.admin" } },
  { key: "settings", label: "Settings", to: "/settings", icon: ic.cog, group: "Admin", requires: { role: STAFF, permission: "module.admin" } },
  { key: "notifications-log", label: "Notifications", to: "/notifications-log", icon: ic.bell, group: "Admin", requires: { role: STAFF, permission: "module.admin" } },
  { key: "audit-log", label: "Audit log", to: "/audit-log", icon: ic.list, group: "Admin", requires: { role: ["admin"], permission: "module.admin" } },
  { key: "status", label: "System status", to: "/status", icon: ic.pulse, group: "Admin" },
  { key: "profile", label: "My profile", to: "/profile", icon: ic.person, group: "Admin" },
];

/** Does an entry pass its gates for this role / section / permission set? */
export function entryVisible(
  entry: NavEntry,
  ctx: { role: Role; section: Section; can: (permission: string) => boolean },
): boolean {
  const r = entry.requires;
  if (!r) return true;
  if (r.role && !r.role.includes(ctx.role)) return false;
  if (r.sections && !r.sections.includes(ctx.section)) return false;
  if (r.permission && !ctx.can(r.permission)) return false;
  return true;
}

export interface NavGroupBucket {
  group: NavGroup;
  items: NavEntry[];
}

export interface UseNavResult {
  /** Top-level pinned items, in declared order, already filtered. */
  pinned: NavEntry[];
  /** Non-empty accordion groups in NAV_GROUP_ORDER, each with its visible items. */
  groups: NavGroupBucket[];
  /** Flat list of every visible entry (handy for the command palette). */
  all: NavEntry[];
}

/**
 * The filtered nav for the current user. Reads the role + active discipline
 * section + effective permissions (which honour the admin "preview as role"
 * override exposed by usePermissions). Memoised on those inputs.
 */
export function useNav(): UseNavResult {
  const { user } = useAuth();
  const { section } = useSection();
  const { can, previewRole } = usePermissions();

  // Role used for *visibility* gating. When an admin is previewing another role,
  // gate the nav as that role so the admin sees what they'd see. Falls back to
  // the real role otherwise.
  const role: Role = (previewRole ?? user?.role ?? "cleaner") as Role;
  // Field staff (cleaner) only ever use the cleaning side.
  const activeSection: Section =
    role === "admin" || role === "supervisor" ? (section ?? "cleaning") : "cleaning";

  return useMemo<UseNavResult>(() => {
    const ctx = { role, section: activeSection, can };
    const visible = NAV_ENTRIES.filter((e) => entryVisible(e, ctx));
    const pinned = visible.filter((e) => e.pinned);
    const grouped = visible.filter((e) => !e.pinned);
    const groups: NavGroupBucket[] = NAV_GROUP_ORDER.map((g) => ({
      group: g,
      items: grouped.filter((e) => e.group === g),
    })).filter((b) => b.items.length > 0);
    return { pinned, groups, all: visible };
    // `can` is stable per render of PermissionsProvider; include the inputs that
    // actually change the result.
  }, [role, activeSection, can]);
}
