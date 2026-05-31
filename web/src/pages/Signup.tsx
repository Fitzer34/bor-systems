import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, setToken } from "../lib/api";
import { useAuth, type CurrentUser } from "../lib/auth";

interface RegisterResponse {
  token: string;
  user: CurrentUser;
}

export function Signup() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [organisationName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    nav("/", { replace: true });
    return null;
  }

  const passwordOk = password.length >= 8 && password === confirm;
  const valid = organisationName.trim() && adminName.trim() && /\S+@\S+\.\S+/.test(email) && passwordOk;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await api<RegisterResponse>("/auth/register-organisation", {
        method: "POST",
        body: JSON.stringify({ organisationName, adminName, email, password }),
      });
      setToken(res.token);
      // Reload so AuthProvider picks up the new token + user via /users/me bootstrap
      window.location.assign("/");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErr("That email is already used in this organisation. Pick a different one.");
      } else {
        setErr("Could not create the organisation. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <form onSubmit={onSubmit} className="bg-slate-900/50 shadow rounded-lg p-8 w-full max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Create your HazardLink organisation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Get your own private workspace. You'll be the admin and can add cleaners and supervisors after.
          </p>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Organisation name</label>
          <input
            value={organisationName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Acme Cleaning Ltd"
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Your name</label>
          <input
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Jane Doe"
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Password (min 8 characters)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
          />
          {confirm && !passwordOk && (
            <div className="text-xs text-red-600 mt-1">
              {password.length < 8 ? "Password must be at least 8 characters." : "Passwords don't match."}
            </div>
          )}
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          type="submit"
          disabled={!valid || busy}
          className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create organisation"}
        </button>

        <div className="text-sm text-center text-slate-500 pt-2">
          Already have an account? <Link to="/login" className="text-blue-600 underline">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
