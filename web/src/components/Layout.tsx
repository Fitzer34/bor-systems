import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, logout, setOnDuty } = useAuth();
  if (!user) return null;
  const isStaff = user.role === "admin" || user.role === "supervisor";
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="font-semibold tracking-wide">BOR Systems</div>
          <div className="text-xs text-slate-400 mt-1">{user.name} · {user.role}</div>
        </div>
        <nav className="flex-1 p-2 space-y-1 text-sm">
          <NavItem to="/" end>Active alerts</NavItem>
          {isStaff && <NavItem to="/hangers">Hangers</NavItem>}
          {isStaff && <NavItem to="/users">Users</NavItem>}
          {user.role === "admin" && <NavItem to="/floor-plans">Floor plans</NavItem>}
          {isStaff && <NavItem to="/reports">Reports</NavItem>}
          {isStaff && <NavItem to="/settings">Settings</NavItem>}
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
      <main className="flex-1 p-8 max-w-6xl">
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
