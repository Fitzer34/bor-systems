import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Login() {
  const { login, completeTotpLogin, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 2FA challenge state — non-null once the password step has succeeded but
  // the user still owes us a 6-digit code or a recovery code.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  if (user) {
    nav("/", { replace: true });
    return null;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.kind === "totp") {
        setChallengeToken(res.challengeToken);
      } else {
        nav("/", { replace: true });
      }
    } catch {
      setErr("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setErr(null);
    setBusy(true);
    try {
      await completeTotpLogin(challengeToken, code.trim());
      nav("/", { replace: true });
    } catch {
      setErr("That code didn't work. Try again, or use a recovery code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4 sm:p-6">
      <div className="w-full max-w-sm">
        {challengeToken ? (
          <form onSubmit={onSubmitCode} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Two-factor authentication</h1>
              <p className="text-sm text-slate-600 mt-1">
                Enter the 6-digit code from your authenticator app, or a recovery code.
              </p>
            </div>
            <div>
              <label className="field-label">Authentication code</label>
              <input
                autoFocus
                required
                inputMode="numeric"
                placeholder="123 456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="input tracking-widest text-center"
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="btn-primary w-full"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => { setChallengeToken(null); setCode(""); setErr(null); }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">HazardLink</h1>
              <p className="text-sm text-slate-600 mt-1">Sign in to your account</p>
            </div>
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                type="password"
                required
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <div className="pt-3 border-t border-slate-200 text-sm text-center text-slate-600">
              New to HazardLink?{" "}
              <Link to="/signup" className="text-blue-700 font-medium hover:underline">
                Create an organisation
              </Link>
            </div>
            <div className="text-xs text-center text-slate-500">
              By signing in you agree to our{" "}
              <Link to="/terms" className="underline">Terms</Link> and{" "}
              <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
