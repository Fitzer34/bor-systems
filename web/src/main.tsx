import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { Login } from "./pages/Login";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { AlertDetail } from "./pages/AlertDetail";
import { Hangers } from "./pages/Hangers";
import { Users } from "./pages/Users";
import { FloorPlans } from "./pages/FloorPlans";
import { Reports } from "./pages/Reports";
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
          <Routes>
            <Route path="/login" element={<Login />} />
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
              <Route path="hangers" element={<RequireAuth role={["admin", "supervisor"]}><Hangers /></RequireAuth>} />
              <Route path="users" element={<RequireAuth role={["admin", "supervisor"]}><Users /></RequireAuth>} />
              <Route path="floor-plans" element={<RequireAuth role={["admin"]}><FloorPlans /></RequireAuth>} />
              <Route path="reports" element={<RequireAuth role={["admin", "supervisor"]}><Reports /></RequireAuth>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
