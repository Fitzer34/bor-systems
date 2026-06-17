import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiUrl } from "../lib/api";
import { useAuth, type CurrentUser } from "../lib/auth";

/**
 * Public, no-login page a new staff member opens from their welcome email
 * (app.hazardlink.ie/accept-invite/:token). They choose a password and are
 * dropped straight into the app, logged in. Mirrors the white-label booking
 * pages (QuoteSubmit / SchedulePage).
 */

interface InviteInfo {
  name: string;
  email: string;
  role: "admin" | "supervisor" | "cleaner";
  orgName: string;
  expired: boolean;
  accepted: boolean;
}

const PW_ERRORS: Record<string, string> = {
  password_too_short: "Password needs at least 10 characters.",
  password_too_long: "That password is too long.",
  password_too_common: "That password is too common — pick something less guessable.",
  password_too_simple: "Use at least 3 of: lowercase, uppercase, digit, symbol.",
};

const ROLE_LABEL: Record<InviteInfo["role"], string> = {
  admin: "Administrator",
  supervisor: "Supervisor",
  cleaner: "Staff",
};

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { adoptSession } = useAuth();
  const nav = useNavigate();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/invite/${token}`))
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d: InviteInfo) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [token]);

  async function submit() {
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/public/invite/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "failed");
      // Logged in — adopt the session and drop into the app.
      adoptSession(body.token as string, body.user as CurrentUser);
      nav("/", { replace: true });
    } catch (e: any) {
      const code = String(e.message);
      setErr(
        PW_ERRORS[code] ??
        (code === "expired" ? "This invite has expired — ask your admin to resend it."
          : code === "already_accepted" ? "This invite has already been used. Try signing in."
          : "Something went wrong — please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {loadError ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h1 className="text-xl font-semibold text-slate-900">Link not found</h1>
              <p className="text-slate-600 mt-2">This invite link is invalid or has already been used.</p>
              <Link to="/login" className="inline-block mt-4 text-blue-600 underline">Go to sign in</Link>
            </div>
          ) : !info ? (
            <p className="text-slate-500 text-center py-10">Loading…</p>
          ) : info.accepted ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-xl font-semibold text-slate-900">Already set up</h1>
              <p className="text-slate-600 mt-2">This invite has already been used. You can sign in with your password.</p>
              <Link to="/login" className="inline-block mt-4 text-blue-600 underline">Go to sign in</Link>
            </div>
          ) : info.expired ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">⌛</div>
              <h1 className="text-xl font-semibold text-slate-900">This invite has expired</h1>
              <p className="text-slate-600 mt-2">Ask {info.orgName} to send you a fresh invite from the Users page.</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-900 text-white px-6 py-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">Welcome to {info.orgName}</div>
                <div className="text-lg font-semibold mt-0.5">Hi {info.name} 👋</div>
                <div className="text-sm text-slate-300 mt-0.5">{info.email} · {ROLE_LABEL[info.role]}</div>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-slate-600">Choose a password to finish setting up your account. You'll be signed straight in.</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Create a password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
                    placeholder="At least 10 characters" autoComplete="new-password"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password" autoComplete="new-password"
                    onKeyDown={(e) => { if (e.key === "Enter" && password && confirm) submit(); }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <p className="text-xs text-slate-500">
                  Must be at least 10 characters and include at least 3 of: lowercase letter,
                  uppercase letter, digit, symbol.
                </p>
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button onClick={submit} disabled={submitting || password.length < 10 || !confirm}
                  className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white font-semibold transition">
                  {submitting ? "Setting up…" : "Set password & sign in"}
                </button>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Powered by HazardLink</p>
      </div>
    </div>
  );
}
