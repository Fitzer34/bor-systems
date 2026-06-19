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
import { Ppms } from "./pages/Ppms";
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
import { SchedulePage } from "./pages/SchedulePage";
import { Status } from "./pages/Status";
import { Sites } from "./pages/Sites";
import { Analytics } from "./pages/Analytics";
import { Maintenance } from "./pages/Maintenance";
import { Assets } from "./pages/Assets";
import { Parts } from "./pages/Parts";
import { MaintenanceDashboard } from "./pages/MaintenanceDashboard";
import { MaintenanceKpis } from "./pages/MaintenanceKpis";
import { Meters } from "./pages/Meters";
import { Competency } from "./pages/Competency";
import { Inspections } from "./pages/Inspections";
import { Sds } from "./pages/Sds";
import { Incidents } from "./pages/Incidents";
import { Checkpoints } from "./pages/Checkpoints";
import { Assistant } from "./pages/Assistant";
import { CheckpointScan } from "./pages/CheckpointScan";
import { LoneWorker } from "./pages/LoneWorker";
import { ReportFault } from "./pages/ReportFault";
import { QuoteSubmit } from "./pages/QuoteSubmit";
import { AcceptInvite } from "./pages/AcceptInvite";
import { ChooseSection } from "./pages/ChooseSection";
import { SectionProvider, useSection } from "./lib/section";
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

// The "/" landing depends on the chosen section: maintenance staff jump to the
// jobs board, everyone else gets the cleaning dashboard (Active alerts).
function SectionHome() {
  const { user } = useAuth();
  const { section } = useSection();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  if (isStaff && section === "maintenance") return <Navigate to="/maintenance-dashboard" replace />;
  if (isStaff && section === "security") return <Navigate to="/incidents" replace />;
  return <Dashboard />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SectionProvider>
        <BrowserRouter>
          <ActiveAlertsWatcher />
          <LiveEventsBridge />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            {/* Public, no-login page a contractor opens from the PPM scheduling
                magic link we email them. */}
            <Route path="/schedule/:token" element={<SchedulePage />} />
            {/* Public, no-login page a guard opens by scanning a checkpoint QR. */}
            <Route path="/c/:token" element={<CheckpointScan />} />
            {/* Public, no-login "report a fault" page behind each asset's QR. */}
            <Route path="/report/:token" element={<ReportFault />} />
            {/* Public, no-login contractor quote page from a tender email. */}
            <Route path="/quote/:token" element={<QuoteSubmit />} />
            {/* Public, no-login page a new staff member opens from their invite
                email — set a password and get dropped into the app, logged in. */}
            <Route path="/accept-invite/:token" element={<AcceptInvite />} />
            {/* Section chooser — pick Cleaning or Maintenance on entry. */}
            <Route path="/choose" element={<RequireAuth><ChooseSection /></RequireAuth>} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<SectionHome />} />
              <Route path="alerts/:id" element={<AlertDetail />} />
              <Route path="profile" element={<Profile />} />
              {/* Unified devices view (gateways + hangers, grouped by building). */}
              <Route path="devices" element={<RequireAuth role={["admin", "supervisor"]}><Devices /></RequireAuth>} />
              {/* Old per-type routes redirect into the unified page so existing
                  links / bookmarks keep working. */}
              <Route path="hangers" element={<Navigate to="/devices" replace />} />
              <Route path="gateways" element={<Navigate to="/devices" replace />} />
              {/* Trackers are assigned per-hanger now (on the hanger), so the old
                  standalone sign-tags page redirects to Devices. */}
              <Route path="sign-tags" element={<Navigate to="/devices" replace />} />
              {/* Planned preventive maintenance (admin + supervisor). */}
              <Route path="ppms" element={<RequireAuth role={["admin", "supervisor"]}><Ppms /></RequireAuth>} />
              <Route path="maintenance" element={<RequireAuth role={["admin", "supervisor"]}><Maintenance /></RequireAuth>} />
              <Route path="assets" element={<RequireAuth role={["admin", "supervisor"]}><Assets /></RequireAuth>} />
              <Route path="parts" element={<RequireAuth role={["admin", "supervisor"]}><Parts /></RequireAuth>} />
              <Route path="maintenance-dashboard" element={<RequireAuth role={["admin", "supervisor"]}><MaintenanceDashboard /></RequireAuth>} />
              <Route path="maintenance-kpis" element={<RequireAuth role={["admin", "supervisor"]}><MaintenanceKpis /></RequireAuth>} />
              <Route path="meters" element={<RequireAuth role={["admin", "supervisor"]}><Meters /></RequireAuth>} />
              <Route path="competency" element={<RequireAuth role={["admin", "supervisor"]}><Competency /></RequireAuth>} />
              <Route path="incidents" element={<RequireAuth role={["admin", "supervisor"]}><Incidents /></RequireAuth>} />
              <Route path="checkpoints" element={<RequireAuth role={["admin", "supervisor"]}><Checkpoints /></RequireAuth>} />
              <Route path="lone-worker" element={<LoneWorker />} />
              <Route path="assistant" element={<RequireAuth role={["admin", "supervisor"]}><Assistant /></RequireAuth>} />
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
              <Route path="inspections" element={<Inspections />} />
              <Route path="sds" element={<Sds />} />
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
        </SectionProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
