import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { ActiveAlertsWatcher } from "./lib/alerts-watcher";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { AlertDetail } from "./pages/AlertDetail";
import { Hangers } from "./pages/Hangers";
import { Users } from "./pages/Users";
import { FloorPlans } from "./pages/FloorPlans";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Profile } from "./pages/Profile";
import { AuditLog } from "./pages/AuditLog";
import { NotificationsLog } from "./pages/NotificationsLog";
import { Schedule } from "./pages/Schedule";
import { Dispatch } from "./pages/Dispatch";
import "./index.css";

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
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
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
              <Route path="hangers" element={<RequireAuth role={["admin", "supervisor"]}><Hangers /></RequireAuth>} />
              <Route path="users" element={<RequireAuth role={["admin", "supervisor"]}><Users /></RequireAuth>} />
              <Route path="floor-plans" element={<RequireAuth role={["admin"]}><FloorPlans /></RequireAuth>} />
              <Route path="reports" element={<RequireAuth role={["admin", "supervisor"]}><Reports /></RequireAuth>} />
              <Route path="settings" element={<RequireAuth role={["admin", "supervisor"]}><Settings /></RequireAuth>} />
              <Route path="audit-log" element={<RequireAuth role={["admin"]}><AuditLog /></RequireAuth>} />
              <Route path="notifications-log" element={<RequireAuth role={["admin", "supervisor"]}><NotificationsLog /></RequireAuth>} />
              <Route path="schedule" element={<RequireAuth role={["admin", "supervisor"]}><Schedule /></RequireAuth>} />
              <Route path="dispatch" element={<RequireAuth role={["admin", "supervisor"]}><Dispatch /></RequireAuth>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
