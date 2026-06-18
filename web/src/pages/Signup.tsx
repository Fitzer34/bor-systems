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
    <div className="min-h-screen flex items-start sm:items-center justify-center bg-slate-100 p-4 sm:p-6">
      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm w-full max-w-md space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your HazardLink organisation</h1>
          <p className="text-sm text-slate-600 mt-1">
            Get your own private workspace. You'll be the admin and can add cleaners and supervisors after.
          </p>
        </div>

        <div>
          <label className="field-label">Organisation name</label>
          <input
            value={organisationName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Acme Cleaning Ltd"
            required
            className="input"
          />
        </div>

        <div>
          <label className="field-label">Your name</label>
          <input
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Jane Doe"
            required
            className="input"
          />
        </div>

        <div>
          <label className="field-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
            className="input"
          />
        </div>

        <div>
          <label className="field-label">Password (min 8 characters)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input"
          />
        </div>

        <div>
          <label className="field-label">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="input"
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
          className="btn-primary w-full"
        >
          {busy ? "Creating…" : "Create organisation"}
        </button>

        <div className="text-sm text-center text-slate-600 pt-2">
          Already have an account? <Link to="/login" className="text-blue-700 font-medium hover:underline">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
