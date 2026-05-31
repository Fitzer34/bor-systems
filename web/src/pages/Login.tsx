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
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      {challengeToken ? (
        <form onSubmit={onSubmitCode} className="bg-slate-900/50 shadow rounded-lg p-8 w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Two-factor authentication</h1>
            <p className="text-sm text-slate-500">
              Enter the 6-digit code from your authenticator app, or a recovery code.
            </p>
          </div>
          <input
            autoFocus
            required
            inputMode="numeric"
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border rounded px-3 py-2 tracking-widest text-center"
          />
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-slate-500"
            onClick={() => { setChallengeToken(null); setCode(""); setErr(null); }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="bg-slate-900/50 shadow rounded-lg p-8 w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-xl font-semibold">HazardLink</h1>
            <p className="text-sm text-slate-500">Sign in</p>
          </div>
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="pt-3 border-t text-sm text-center text-slate-500">
            New to HazardLink?{" "}
            <Link to="/signup" className="text-blue-600 underline font-medium">
              Create an organisation
            </Link>
          </div>
          <div className="text-xs text-center text-slate-400">
            By signing in you agree to our{" "}
            <Link to="/terms" className="underline">Terms</Link> and{" "}
            <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </div>
        </form>
      )}
    </div>
  );
}
