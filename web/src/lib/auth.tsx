import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "supervisor" | "cleaner";
  onDuty: boolean;
  phoneE164?: string | null;
  locale?: string;
  organisationId?: string;
  organisationName?: string;
}

export type LoginResult =
  | { kind: "ok" }
  | { kind: "totp"; challengeToken: string };

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTotpLogin: (challengeToken: string, code: string) => Promise<void>;
  /** Adopt a session minted elsewhere (e.g. accepting a staff invite). */
  adoptSession: (token: string, user: CurrentUser) => void;
  logout: () => void;
  setOnDuty: (onDuty: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<CurrentUser>("/users/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const res = await api<
      | { token: string; user: CurrentUser }
      | { challenge: "totp"; challengeToken: string }
    >("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if ("challenge" in res) {
      return { kind: "totp", challengeToken: res.challengeToken };
    }
    setToken(res.token);
    setUser(res.user);
    return { kind: "ok" };
  };

  const completeTotpLogin = async (challengeToken: string, code: string) => {
    const res = await api<{ token: string; user: CurrentUser }>("/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    setToken(res.token);
    setUser(res.user);
  };

  const adoptSession = (token: string, u: CurrentUser) => {
    setToken(token);
    setUser(u);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const setOnDuty = async (onDuty: boolean) => {
    await api("/auth/duty", { method: "POST", body: JSON.stringify({ onDuty }) });
    setUser((u) => (u ? { ...u, onDuty } : u));
  };

  // Re-pull the current user (e.g. after editing profile) so fields like the
  // saved phone number reflect the server, not the stale login snapshot.
  const refreshUser = async () => {
    if (!getToken()) return;
    try {
      setUser(await api<CurrentUser>("/users/me"));
    } catch {
      /* keep the existing user on a transient error */
    }
  };

  return (
    <Ctx.Provider value={{ user, loading, login, completeTotpLogin, adoptSession, logout, setOnDuty, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
