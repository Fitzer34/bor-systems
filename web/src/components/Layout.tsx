import { useState, useEffect, useMemo } from "react";
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSection, type Section } from "../lib/section";
import { usePermissions } from "../lib/permissions";
import { useNav, type NavEntry, type NavGroup } from "../lib/nav";
import { CommandPalette, type CommandPaletteItem } from "./CommandPalette";
import { AccountMenu } from "./AccountMenu";
import { NotificationBell } from "./NotificationBell";

/** Small brand lockup — rounded blue badge + wordmark.
 *  On the dark sidebar it also carries the "SITE COMMAND CENTRE" eyebrow. */
function Brand({ compact = false, withSubtitle = false }: { compact?: boolean; withSubtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 shadow-sm">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tracking-tight text-white">HazardLink</span>
          {withSubtitle && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7C8AA5]">
              Site command centre
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// Per-discipline identity: label + accent (light shade for the dark sidebar) +
// a small inline icon. Replaces the old emoji glyphs (no emoji as UI icons).
const DISCIPLINES: Record<Exclude<Section, never>, { label: string; dot: string; icon: JSX.Element }> = {
  cleaning: {
    label: "Cleaning",
    dot: "text-cyan-400",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z" />
      </svg>
    ),
  },
  maintenance: {
    label: "Maintenance",
    dot: "text-amber-400",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 17l3 3 5.5-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.1-.5-.5-2.1 2.7-2.5z" />
      </svg>
    ),
  },
  security: {
    label: "Security",
    dot: "text-indigo-400",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      </svg>
    ),
  },
};

const OPEN_GROUPS_KEY = "hazardlink.navOpenGroups";

/** "cleaner" → "Field staff" in the UI only. */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  cleaner: "Field staff",
};

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Initials from a display name (max 2 letters) — mirrors AccountMenu. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function Layout() {
  const { user, logout, setOnDuty } = useAuth();
  const { section } = useSection();
  const { isPreviewing, previewRole, clearPreview } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useNav();

  // Sidebar drawer state (mobile only — sidebar is always-visible on >= md).
  const [mobileOpen, setMobileOpen] = useState(false);
  // ⌘K / Ctrl+K quick-navigation palette.
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Which accordion group contains the currently-active route? Also surface the
  // matching entry so the desktop top bar can show its label as a breadcrumb.
  const { activeGroup, activeEntry } = useMemo(() => {
    const path = location.pathname;
    // Flatten pinned + grouped entries with their group label, then pick the
    // longest matching `to` (most specific route wins).
    const candidates: { group: NavGroup; entry: NavEntry }[] = [
      ...nav.pinned.map((entry) => ({ group: entry.group, entry })),
      ...nav.groups.flatMap((bucket) => bucket.items.map((entry) => ({ group: bucket.group, entry }))),
    ];
    let best: { group: NavGroup; entry: NavEntry } | null = null;
    for (const c of candidates) {
      const { entry } = c;
      const match = entry.end ? path === entry.to : path === entry.to || path.startsWith(entry.to + "/");
      if (match && (!best || entry.to.length > best.entry.to.length)) best = c;
    }
    return { activeGroup: best?.group ?? null, activeEntry: best?.entry ?? null };
  }, [location.pathname, nav.groups, nav.pinned]);

  // Persisted open/closed state per group. Default: only the active group open.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups);
  useEffect(() => {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (g: NavGroup) =>
    setOpenGroups((s) => ({ ...s, [g]: !isGroupOpen(g, s) }));

  // A group is open if the user explicitly set it, otherwise if it's the active
  // group. (Explicit state — including an explicit false — wins over the default.)
  const isGroupOpen = (g: NavGroup, state: Record<string, boolean> = openGroups): boolean => {
    if (g in state) return state[g] === true;
    return g === activeGroup;
  };

  if (!user) return null;
  const isStaff = user.role === "admin" || user.role === "supervisor";
  const activeSection: Section = isStaff ? (section ?? "cleaning") : "cleaning";
  // Staff who haven't picked a side yet go to the chooser first.
  if (isStaff && !section) return <Navigate to="/choose" replace />;

  const disc = DISCIPLINES[activeSection];

  // Command palette items are sourced from the SAME filtered nav (single source
  // of truth) so the palette and sidebar never drift. Group label = nav group,
  // with pinned items surfaced under "Quick access".
  const cmdItems: CommandPaletteItem[] = [
    ...nav.pinned.map((e) => ({ group: "Quick access", label: e.label, to: e.to })),
    ...nav.groups.flatMap((b) => b.items.map((e) => ({ group: b.group, label: e.label, to: e.to }))),
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface">
      {/* ─── Mobile top bar (visible < md only) ─────────────────────────── */}
      <div className="flex md:hidden items-center justify-between bg-sidebar text-slate-100 px-3 py-3 sticky top-0 z-30">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3"  y1="6"  x2="21" y2="6" />
            <line x1="3"  y1="12" x2="21" y2="12" />
            <line x1="3"  y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Brand />
        <div className="w-10" />
      </div>

      {/* ─── Backdrop (mobile only, when drawer open) ──────────────────── */}
      {mobileOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm"
        />
      )}

      {/* ─── Sidebar (stays DARK navy in the light app) ──────────────────── */}
      <aside
        className={
          "w-[248px] bg-sidebar text-slate-100 flex flex-col shrink-0 " +
          "md:static md:translate-x-0 " +
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="px-4 py-5 border-b border-white/5">
          <Brand withSubtitle />
          {user.organisationName && (
            <div className="text-xs text-slate-300 mt-3 truncate">{user.organisationName}</div>
          )}
          <div className="text-xs text-[#7C8AA5] mt-0.5">
            {user.name} · {ROLE_LABEL[user.role] ?? user.role}
          </div>
        </div>

        <nav
          className="flex-1 p-2 space-y-0.5 text-sm overflow-y-auto"
          onClick={() => setMobileOpen(false)}
        >
          {/* Quick find — opens the ⌘K command palette. */}
          <button
            onClick={(e) => { e.stopPropagation(); setCmdOpen(true); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Quick find
            </span>
            <kbd className="text-[10px] font-medium text-[#7C8AA5] border border-white/10 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>

          {/* Section switcher (staff only). */}
          {isStaff && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate("/choose"); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg bg-sidebar-active hover:bg-[#23355a] text-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="flex items-center gap-2 font-medium">
                <span className={disc.dot}>{disc.icon}</span>
                {disc.label}
              </span>
              <span className="flex items-center gap-1 text-xs text-[#7C8AA5]">
                Switch
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 10l-3-3 3-3" /><path d="M4 7h12a4 4 0 0 1 4 4" />
                  <path d="M17 14l3 3-3 3" /><path d="M20 17H8a4 4 0 0 1-4-4" />
                </svg>
              </span>
            </button>
          )}

          {/* ─── Pinned items (top, no group) ─── */}
          {nav.pinned.map((entry) => (
            <NavItem key={entry.key} to={entry.to} end={entry.end} icon={entry.icon}>
              {entry.label}
            </NavItem>
          ))}

          {/* ─── Collapsible groups ─── */}
          {nav.groups.map((bucket) => (
            <NavGroupAccordion
              key={bucket.group}
              group={bucket.group}
              items={bucket.items}
              open={isGroupOpen(bucket.group)}
              onToggle={() => toggleGroup(bucket.group)}
            />
          ))}
        </nav>

        {/* Footer: duty toggle, live-status line, log out. */}
        <div className="p-3 border-t border-white/5 text-sm">
          <SidebarStatus />
          <button
            onClick={() => setOnDuty(!user.onDuty)}
            className="mt-2 w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-white/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-pressed={user.onDuty}
          >
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${user.onDuty ? "bg-emerald-400" : "bg-slate-500"}`} />
              {user.onDuty ? "On duty" : "Off duty"}
            </span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${user.onDuty ? "bg-emerald-500" : "bg-slate-600"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${user.onDuty ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          </button>
          <button
            onClick={logout}
            className="mt-1 w-full text-left rounded-lg px-3 py-2 text-[#7C8AA5] hover:text-slate-100 hover:bg-white/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* ─── Main column (header + page content) ─────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop header — light bar over the white content. Left: breadcrumb.
            Centre-left: lightweight scope pills. Right: search, scan, the
            Ask-HazardLink CTA, notifications and the account avatar. Hidden on
            mobile (the mobile top bar carries the brand + hamburger). */}
        <header className="hidden md:flex items-center gap-3 border-b border-hairline bg-white px-6 h-16 shrink-0">
          {/* Breadcrumb — current section/page. */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-semibold text-slate-900 truncate">
              {activeEntry?.label ?? "Dashboard"}
            </span>
          </div>

          {/* Scope pills — navigate to the existing chooser / roles pages. */}
          <div className="hidden lg:flex items-center gap-2 ml-1">
            <ScopePill
              label={isStaff ? disc.label : "All teams"}
              onClick={() => isStaff && navigate("/choose")}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>
              }
            />
            <ScopePill
              label="All sites"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" /></svg>
              }
            />
            {user.role === "admin" && (
              <ScopePill
                label={isPreviewing && previewRole ? `Previewing: ${ROLE_LABEL[previewRole] ?? previewRole}` : "Preview as role"}
                active={isPreviewing}
                onClick={() => navigate("/roles")}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
                }
              />
            )}
          </div>

          {/* Right cluster. */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Search opens the ⌘K palette (same destination as Quick find). */}
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="hidden xl:flex items-center gap-2 h-9 w-64 rounded-lg border border-hairline bg-white pl-3 pr-2 text-sm text-slate-400 hover:border-slate-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <span className="truncate">Search jobs, assets, sites…</span>
              <kbd className="ml-auto shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">⌘K</kbd>
            </button>

            {/* Scan — quick QR scan entry (checkpoint scanning). */}
            <button
              type="button"
              onClick={() => navigate("/checkpoints")}
              className="btn-secondary h-9"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></svg>
              Scan
            </button>

            {/* Ask HazardLink — primary CTA (staff only, mirrors the pinned nav). */}
            {isStaff && (
              <button
                type="button"
                onClick={() => navigate("/assistant")}
                className="btn-primary h-9"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg>
                Ask HazardLink
              </button>
            )}

            <NotificationBell />
            <AccountMenu />
          </div>
        </header>

        {/* Preview-mode banner (admin previewing another role from /roles). */}
        {isPreviewing && previewRole && (
          <div className="bg-blue-600 text-white text-sm px-4 md:px-8 py-2 flex items-center justify-between gap-3">
            <span>
              Previewing as <strong>{ROLE_LABEL[previewRole] ?? previewRole}</strong>. This only changes what
              you see — your access is unchanged.
            </span>
            <button onClick={clearPreview} className="underline underline-offset-2 shrink-0">
              Exit preview
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-8 md:max-w-6xl">
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={cmdItems}
        onNavigate={(to) => navigate(to)}
      />
    </div>
  );
}

/** Live-status line in the sidebar footer — "N sites live · All systems
 *  operational" with a colour-coded dot. Both reads are decorative and degrade
 *  silently (the public /status endpoint drives the health text/dot; the cached
 *  sites summary supplies the count when available). */
function SidebarStatus() {
  const { data: status } = useQuery<{ service: "up" | "degraded" | "down" }>({
    queryKey: ["status"],
    queryFn: () => api<{ service: "up" | "degraded" | "down" }>("/status"),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  // Reuse the Sites page's cache key so we share data when it's already loaded;
  // gated to staff so we don't fire it for field-staff sessions that lack access.
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  const { data: sites } = useQuery<{ sites: unknown[] }>({
    queryKey: ["sites-summary"],
    queryFn: () => api<{ sites: unknown[] }>("/sites/summary"),
    enabled: isStaff,
    staleTime: 30_000,
    retry: false,
  });

  const service = status?.service ?? "up";
  const dot = service === "down" ? "bg-red-400" : service === "degraded" ? "bg-amber-400" : "bg-emerald-400";
  const health =
    service === "down" ? "Outage in progress"
    : service === "degraded" ? "Performance degraded"
    : "All systems operational";
  const count = sites?.sites?.length;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#7C8AA5]">
      <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
      <span className="truncate">
        {typeof count === "number" ? `${count} site${count === 1 ? "" : "s"} live · ` : ""}{health}
      </span>
    </div>
  );
}

/** A light pill "dropdown" affordance in the desktop top bar. */
function ScopePill({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 h-9 rounded-lg border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40 " +
        (active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-hairline bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900")
      }
    >
      <span className={active ? "text-blue-600" : "text-slate-400"}>{icon}</span>
      <span className="truncate max-w-[12rem]">{label}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-slate-400">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

/** A single collapsible nav group with a chevron header. */
function NavGroupAccordion({
  group,
  items,
  open,
  onToggle,
}: {
  group: NavGroup;
  items: NavEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `nav-group-${group.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
  return (
    <div className="pt-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider text-[#7C8AA5] hover:text-slate-200 hover:bg-white/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span>{group}</span>
        <span className="flex items-center gap-1.5">
          {/* When collapsed, roll the item count onto the parent as a badge. */}
          {!open && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/10 text-[10px] font-medium text-slate-200">
              {items.length}
            </span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            className={"transition-transform " + (open ? "rotate-180" : "")}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && (
        <div id={panelId} className="mt-0.5 space-y-0.5">
          {items.map((entry) => (
            <NavItem key={entry.key} to={entry.to} end={entry.end} icon={entry.icon}>
              {entry.label}
            </NavItem>
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        "flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (isActive
          ? "bg-sidebar-active text-white border-blue-500 font-medium"
          : "text-slate-300 border-transparent hover:bg-white/5 hover:text-white")
      }
    >
      {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      <span className="truncate">{children}</span>
    </NavLink>
  );
}
