import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { ActiveAlertsWatcher } from "./lib/alerts-watcher";
import { LiveEventsBridge } from "./lib/live-events";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { AlertDetail } from "./pages/AlertDetail";
import { Devices } from "./pages/Devices";
import { Users } from "./pages/Users";
import { FloorPlans } from "./pages/FloorPlans";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Profile } from "./pages/Profile";
import { AuditLog } from "./pages/AuditLog";
import { NotificationsLog } from "./pages/NotificationsLog";
import { Schedule } from "./pages/Schedule";
import { Dispatch } from "./pages/Dispatch";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Status } from "./pages/Status";
import { Sites } from "./pages/Sites";
import { Analytics } from "./pages/Analytics";
import { initWebSentry } from "./lib/sentry";
import "./index.css";

initWebSentry();

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });

function RequireAuth({ children, role }: { children: JSX.Element; role?: Array<"admin" | "supervisor" | "cleaner"> }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && !role.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ActiveAlertsWatcher />
          <LiveEventsBridge />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="alerts/:id" element={<AlertDetail />} />
              <Route path="profile" element={<Profile />} />
              {/* Unified devices view (gateways + hangers, grouped by building). */}
              <Route path="devices" element={<RequireAuth role={["admin", "supervisor"]}><Devices /></RequireAuth>} />
              {/* Old per-type routes redirect into the unified page so existing
                  links / bookmarks keep working. */}
              <Route path="hangers" element={<Navigate to="/devices" replace />} />
              <Route path="gateways" element={<Navigate to="/devices" replace />} />
              <Route path="users" element={<RequireAuth role={["admin", "supervisor"]}><Users /></RequireAuth>} />
              <Route path="floor-plans" element={<RequireAuth role={["admin"]}><FloorPlans /></RequireAuth>} />
              <Route path="reports" element={<RequireAuth role={["admin", "supervisor"]}><Reports /></RequireAuth>} />
              <Route path="settings" element={<RequireAuth role={["admin", "supervisor"]}><Settings /></RequireAuth>} />
              <Route path="audit-log" element={<RequireAuth role={["admin"]}><AuditLog /></RequireAuth>} />
              <Route path="notifications-log" element={<RequireAuth role={["admin", "supervisor"]}><NotificationsLog /></RequireAuth>} />
              {/* Schedule + Dispatch are accessible to every role. The page
                  itself renders different content based on role (read-only
                  for cleaners, full-create for admin/supervisor). */}
              <Route path="schedule" element={<Schedule />} />
              <Route path="dispatch" element={<Dispatch />} />
              {/* System status — visible to every authed user. Backed by the
                  public /status endpoint (also consumed by external uptime
                  monitors). */}
              <Route path="status" element={<Status />} />
              {/* Multi-site rollup for enterprise customers managing
                  multiple buildings. Admin + supervisor only. */}
              <Route path="sites" element={
                <RequireAuth role={["admin", "supervisor"]}><Sites /></RequireAuth>
              } />
              <Route path="analytics" element={
                <RequireAuth role={["admin", "supervisor"]}><Analytics /></RequireAuth>
              } />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
