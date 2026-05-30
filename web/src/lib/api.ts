const TOKEN_KEY = "bor.token";

// In dev (`npm run dev` via Vite), `/api/*` is proxied to localhost:3000.
// In production (Cloudflare Workers / Pages), there's no proxy — so we
// have to hit the deployed backend directly. `import.meta.env.PROD` is
// `true` only in `vite build` output, `false` in `vite dev`.
// Exported so non-JSON requests (e.g. multipart floor-plan uploads, which
// can't go through the JSON `api()` helper) can build the correct URL in
// both dev and prod. In dev this is "" (Vite proxy handles /api); in prod
// it's the Render backend origin.
export const API_BASE = import.meta.env.PROD
  ? "https://bor-systems-backend.onrender.com"
  : ""; // empty string → request goes to same origin, picked up by Vite proxy

/** Build a full request URL the same way `api()` does, for manual fetches. */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : `/api${path}`;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`api error ${status}`);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  // In dev: hits Vite proxy which strips /api and forwards to localhost:3000.
  // In prod: hits Render backend directly — backend has no /api prefix, so
  // we skip the /api segment entirely.
  const url = API_BASE ? `${API_BASE}${path}` : `/api${path}`;
  const res = await fetch(url, { ...init, headers });

  // Sliding session: the backend ships a refreshed token in this header
  // when our current one is more than a day old. Swap it in silently so
  // the user never sees a "session expired" prompt while they're active.
  const refreshed = res.headers.get("x-refreshed-token");
  if (refreshed) setToken(refreshed);

  // NOTE: we used to nuke the token and redirect to /login on every 401.
  // Problem: a single transient 401 (server hiccup, deploy rollover, a
  // background poll firing a millisecond before the JWT was set in storage)
  // would destroy the user's session mid-use. JWTs are stateless — another
  // user logging in elsewhere never invalidates yours. So we now only
  // redirect on a SUSTAINED 401: throw the error and let the AuthProvider's
  // mount-time `/users/me` check decide whether the session is really dead.
  if (res.status === 401 && path === "/users/me") {
    setToken(null);
    if (location.pathname !== "/login") location.assign("/login");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
