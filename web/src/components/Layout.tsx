import { useState } from "react";
import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSection } from "../lib/section";

export function Layout() {
  const { user, logout, setOnDuty } = useAuth();
  const { section } = useSection();
  const navigate = useNavigate();
  // Sidebar drawer state (mobile only — sidebar is always-visible on >= md).
  // Default closed on every navigation so the drawer doesn't linger over the
  // page the user just tapped to.
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;
  const isStaff = user.role === "admin" || user.role === "supervisor";
  // Cleaners only ever use the cleaning side, so they skip the chooser.
  const activeSection = isStaff ? section : "cleaning";
  // Staff who haven't picked a side yet go to the chooser first.
  if (isStaff && !section) return <Navigate to="/choose" replace />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ─── Mobile top bar (visible < md only) ─────────────────────────── */}
      <div className="flex md:hidden items-center justify-between bg-slate-900 text-slate-100 px-3 py-3 sticky top-0 z-30">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded hover:bg-slate-800"
        >
          {/* 3-line hamburger — no icon library dep */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3"  y1="6"  x2="21" y2="6" />
            <line x1="3"  y1="12" x2="21" y2="12" />
            <line x1="3"  y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="font-semibold text-sm">HazardLink</div>
        {/* Spacer so the title stays centered between the hamburger and a
            zero-width invisible right column. */}
        <div className="w-10" />
      </div>

      {/* ─── Backdrop (mobile only, when drawer open) ──────────────────── */}
      {mobileOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/50"
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
          <div className="font-semibold tracking-wide">HazardLink</div>
          {user.organisationName && (
            <div className="text-xs text-slate-300 mt-1 truncate">{user.organisationName}</div>
          )}
          <div className="text-xs text-slate-400 mt-1">{user.name} · {user.role}</div>
        </div>
        <nav
          className="flex-1 p-2 space-y-1 text-sm overflow-y-auto"
          onClick={() => setMobileOpen(false)}
        >
          {/* Section switcher (staff only) — flip between Cleaning & Maintenance. */}
          {isStaff && (
            <button
              onClick={() => navigate("/choose")}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100"
            >
              <span className="font-medium">{activeSection === "maintenance" ? "🔧 Maintenance" : "🧹 Cleaning"}</span>
              <span className="text-xs text-slate-400">Switch ⇄</span>
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
              {isStaff && <NavItem to="/devices">Devices</NavItem>}
              {user.role === "admin" && <NavItem to="/floor-plans">Floor plans</NavItem>}
              {isStaff && <NavItem to="/reports">Reports</NavItem>}
            </>
          )}

          {/* ─── Maintenance side (CMMS / FM) ─── */}
          {activeSection === "maintenance" && isStaff && (
            <>
              <NavItem to="/maintenance">Jobs</NavItem>
              <NavItem to="/assets">Assets</NavItem>
              <NavItem to="/ppms">PPMs</NavItem>
            </>
          )}

          {/* ─── Company-wide (both sides) ─── */}
          <div className="pt-3 mt-3 border-t border-slate-800">
            {isStaff && <NavItem to="/users">Users</NavItem>}
            {isStaff && <NavItem to="/settings">Settings</NavItem>}
            {isStaff && <NavItem to="/notifications-log">Notifications</NavItem>}
            {user.role === "admin" && <NavItem to="/audit-log">Audit log</NavItem>}
            <NavItem to="/profile">My profile</NavItem>
            <NavItem to="/status">System status</NavItem>
          </div>
        </nav>
        <div className="p-3 border-t border-slate-800 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={user.onDuty}
              onChange={(e) => setOnDuty(e.target.checked)}
            />
            <span>{user.onDuty ? "On duty" : "Off duty"}</span>
          </label>
          <button onClick={logout} className="mt-3 w-full text-left text-slate-400 hover:text-slate-200">Log out</button>
        </div>
      </aside>

      {/* ─── Page content ───────────────────────────────────────────────
          Phones: full width, compact padding.
          Tablets and up: generous padding, capped width so very wide
          monitors don't make long lines unreadable. */}
      <main className="flex-1 min-w-0 p-4 md:p-8 md:max-w-6xl">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block rounded px-3 py-2 ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60"}`
      }
    >
      {children}
    </NavLink>
  );
}
