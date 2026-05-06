import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "supervisor" | "cleaner";
  onDuty: boolean;
  locale: string;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setOnDuty: (onDuty: boolean) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) { setLoading(false); return; }
      try {
        setUser(await api<CurrentUser>("/users/me"));
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await setToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  const setOnDuty = async (onDuty: boolean) => {
    await api("/auth/duty", { method: "POST", body: JSON.stringify({ onDuty }) });
    setUser((u) => (u ? { ...u, onDuty } : u));
  };

  return <Ctx.Provider value={{ user, loading, login, logout, setOnDuty }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
