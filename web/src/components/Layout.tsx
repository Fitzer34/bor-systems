import { useState, useEffect } from "react";
import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSection, type Section } from "../lib/section";
import { CommandPalette, type CommandPaletteItem } from "./CommandPalette";

/** Small brand lockup — rounded blue badge + wordmark. */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      {!compact && <span className="font-semibold tracking-wide">HazardLink</span>}
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

export function Layout() {
  const { user, logout, setOnDuty } = useAuth();
  const { section } = useSection();
  const navigate = useNavigate();
  // Sidebar drawer state (mobile only — sidebar is always-visible on >= md).
  // Default closed on every navigation so the drawer doesn't linger over the
  // page the user just tapped to.
  const [mobileOpen, setMobileOpen] = useState(false);
  // ⌘K / Ctrl+K quick-navigation palette (component adapted from a 21st.dev /
  // Magic design — see components/CommandPalette.tsx).
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

  if (!user) return null;
  const isStaff = user.role === "admin" || user.role === "supervisor";
  // Cleaners only ever use the cleaning side, so they skip the chooser.
  const activeSection: Section = isStaff ? (section ?? "cleaning") : "cleaning";
  // Staff who haven't picked a side yet go to the chooser first.
  if (isStaff && !section) return <Navigate to="/choose" replace />;

  const disc = DISCIPLINES[activeSection];
  const isAdmin = user.role === "admin";

  // Cross-section quick-nav targets for the command palette, gated by role to
  // match the sidebar. Lets staff jump anywhere (e.g. to Maintenance while in
  // the Cleaning section) without switching sides first.
  const cmdItems: CommandPaletteItem[] = [
    { group: "Cleaning", label: "Active alerts", to: "/" },
    ...(isStaff ? [
      { group: "Cleaning", label: "Sites overview", to: "/sites" },
      { group: "Cleaning", label: "Analytics", to: "/analytics" },
    ] : []),
    { group: "Cleaning", label: "Dispatch", to: "/dispatch" },
    { group: "Cleaning", label: "Schedule", to: "/schedule" },
    { group: "Cleaning", label: "Inspections", to: "/inspections" },
    ...(isStaff ? [{ group: "Cleaning", label: "Devices", to: "/devices" }] : []),
    ...(isAdmin ? [{ group: "Cleaning", label: "Floor plans", to: "/floor-plans" }] : []),
    ...(isStaff ? [{ group: "Cleaning", label: "Reports", to: "/reports" }] : []),
    ...(isStaff ? [
      { group: "Maintenance", label: "Maintenance dashboard", to: "/maintenance-dashboard" },
      { group: "Maintenance", label: "Maintenance KPIs", to: "/maintenance-kpis" },
      { group: "Maintenance", label: "Jobs", to: "/maintenance" },
      { group: "Maintenance", label: "Assets", to: "/assets" },
      { group: "Maintenance", label: "Meters", to: "/meters" },
      { group: "Maintenance", label: "Parts", to: "/parts" },
      { group: "Maintenance", label: "PPMs", to: "/ppms" },
      { group: "Maintenance", label: "Competency", to: "/competency" },
      { group: "Security", label: "Incidents", to: "/incidents" },
      { group: "Security", label: "Checkpoints", to: "/checkpoints" },
      { group: "Company", label: "Assistant", to: "/assistant" },
      { group: "Company", label: "Users", to: "/users" },
      { group: "Company", label: "Settings", to: "/settings" },
      { group: "Company", label: "Notifications", to: "/notifications-log" },
    ] : []),
    ...(isAdmin ? [{ group: "Company", label: "Audit log", to: "/audit-log" }] : []),
    { group: "Company", label: "Lone worker", to: "/lone-worker" },
    { group: "Company", label: "My profile", to: "/profile" },
    { group: "Company", label: "System status", to: "/status" },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ─── Mobile top bar (visible < md only) ─────────────────────────── */}
      <div className="flex md:hidden items-center justify-between bg-slate-900 text-slate-100 px-3 py-3 sticky top-0 z-30">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {/* 3-line hamburger — no icon library dep */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3"  y1="6"  x2="21" y2="6" />
            <line x1="3"  y1="12" x2="21" y2="12" />
            <line x1="3"  y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Brand />
        {/* Spacer so the brand stays centered between the hamburger and a
            zero-width invisible right column. */}
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

      {/* ─── Sidebar ───────────────────────────────────────────────────────
          On md+ this is a static column (always visible).
          On smaller screens it becomes a fixed slide-out drawer that
          appears when the hamburger is tapped. */}
      <aside
        className={
          "w-60 bg-slate-900 text-slate-100 flex flex-col " +
          "md:static md:translate-x-0 " +
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="px-4 py-5 border-b border-slate-800">
          <Brand />
          {user.organisationName && (
            <div className="text-xs text-slate-300 mt-2 truncate">{user.organisationName}</div>
          )}
          <div className="text-xs text-slate-400 mt-0.5">{user.name} · {user.role}</div>
        </div>
        <nav
          className="flex-1 p-2 space-y-0.5 text-sm overflow-y-auto"
          onClick={() => setMobileOpen(false)}
        >
          {/* Quick find — opens the ⌘K command palette. */}
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-1 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Quick find
            </span>
            <kbd className="text-[10px] font-medium text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>

          {/* Section switcher (staff only) — flip between Cleaning / Maintenance / Security. */}
          {isStaff && (
            <button
              onClick={() => navigate("/choose")}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="flex items-center gap-2 font-medium">
                <span className={disc.dot}>{disc.icon}</span>
                {disc.label}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                Switch
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 10l-3-3 3-3" /><path d="M4 7h12a4 4 0 0 1 4 4" />
                  <path d="M17 14l3 3-3 3" /><path d="M20 17H8a4 4 0 0 1-4-4" />
                </svg>
              </span>
            </button>
          )}

          {/* ─── Cleaning side (IoT spill safety) ─── */}
          {activeSection === "cleaning" && (
            <>
              <NavItem to="/" end>Active alerts</NavItem>
              {isStaff && <NavItem to="/sites">Sites overview</NavItem>}
              {isStaff && <NavItem to="/analytics">Analytics</NavItem>}
              {/* Dispatch + Schedule are visible to everyone. Cleaners get
                  read-only views (their own shifts and dispatches sent to them)
                  so they know where they're meant to be. */}
              <NavItem to="/dispatch">Dispatch</NavItem>
              <NavItem to="/schedule">Schedule</NavItem>
              <NavItem to="/inspections">Inspections</NavItem>
              {isStaff && <NavItem to="/checkpoints">Checkpoints</NavItem>}
              {isStaff && <NavItem to="/devices">Devices</NavItem>}
              {user.role === "admin" && <NavItem to="/floor-plans">Floor plans</NavItem>}
              {isStaff && <NavItem to="/reports">Reports</NavItem>}
            </>
          )}

          {/* ─── Maintenance side (CMMS / FM) ─── */}
          {activeSection === "maintenance" && isStaff && (
            <>
              <NavItem to="/maintenance-dashboard">Dashboard</NavItem>
              <NavItem to="/maintenance-kpis">KPIs</NavItem>
              <NavItem to="/maintenance">Jobs</NavItem>
              <NavItem to="/assets">Assets</NavItem>
              <NavItem to="/meters">Meters</NavItem>
              <NavItem to="/parts">Parts</NavItem>
              <NavItem to="/ppms">PPMs</NavItem>
              <NavItem to="/competency">Competency</NavItem>
            </>
          )}

          {/* ─── Security side ─── */}
          {activeSection === "security" && isStaff && (
            <>
              <NavItem to="/incidents">Incidents</NavItem>
              <NavItem to="/checkpoints">Checkpoints</NavItem>
            </>
          )}

          {/* ─── Company-wide (both sides) ─── */}
          <div className="pt-3 mt-3 border-t border-slate-800 space-y-0.5">
            {isStaff && <NavItem to="/assistant">Assistant</NavItem>}
            {isStaff && <NavItem to="/users">Users</NavItem>}
            {isStaff && <NavItem to="/settings">Settings</NavItem>}
            {isStaff && <NavItem to="/notifications-log">Notifications</NavItem>}
            {user.role === "admin" && <NavItem to="/audit-log">Audit log</NavItem>}
            <NavItem to="/lone-worker">Lone worker</NavItem>
            <NavItem to="/profile">My profile</NavItem>
            <NavItem to="/status">System status</NavItem>
          </div>
        </nav>
        <div className="p-3 border-t border-slate-800 text-sm">
          <button
            onClick={() => setOnDuty(!user.onDuty)}
            className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-pressed={user.onDuty}
          >
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${user.onDuty ? "bg-emerald-400" : "bg-slate-500"}`} />
              {user.onDuty ? "On duty" : "Off duty"}
            </span>
            {/* Track + knob toggle */}
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${user.onDuty ? "bg-emerald-500" : "bg-slate-600"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${user.onDuty ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          </button>
          <button
            onClick={logout}
            className="mt-1 w-full text-left rounded-lg px-3 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* ─── Page content ───────────────────────────────────────────────
          Phones: full width, compact padding.
          Tablets and up: generous padding, capped width so very wide
          monitors don't make long lines unreadable. */}
      <main className="flex-1 min-w-0 p-4 md:p-8 md:max-w-6xl">
        <Outlet />
      </main>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={cmdItems}
        onNavigate={(to) => navigate(to)}
      />
    </div>
  );
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        "flex items-center rounded-lg border-l-2 px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (isActive
          ? "bg-slate-800 text-white border-blue-500 font-medium"
          : "text-slate-300 border-transparent hover:bg-slate-800/60 hover:text-white")
      }
    >
      {children}
    </NavLink>
  );
}
