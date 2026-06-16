import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface TwoFactorStatus {
  enrolled: boolean;
  enrolledAt: string | null;
  required: boolean;
}

interface EnrolResponse {
  secret: string;
  otpauth: string;
  qrDataUrl: string;
}

function TwoFactorSection() {
  const qc = useQueryClient();
  const status = useQuery<TwoFactorStatus>({
    queryKey: ["2fa-status"],
    queryFn: () => api("/auth/2fa/status"),
  });
  const [enrol, setEnrol] = useState<EnrolResponse | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => api<EnrolResponse>("/auth/2fa/enrol", { method: "POST" }),
    onSuccess: (r) => { setEnrol(r); setErr(null); },
    onError: () => setErr("Could not start enrolment. If you already have 2FA enabled, disable it first."),
  });

  const confirm = useMutation({
    mutationFn: () =>
      api<{ ok: true; recoveryCodes: string[] }>("/auth/2fa/enrol/confirm", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      }),
    onSuccess: (r) => {
      setRecoveryCodes(r.recoveryCodes);
      setEnrol(null);
      setCode("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
    },
    onError: () => setErr("That code didn't match. Try the next one your app shows."),
  });

  const disable = useMutation({
    mutationFn: () =>
      api("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: disableCode.trim() }),
      }),
    onSuccess: () => {
      setDisableCode("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["2fa-status"] });
    },
    onError: () => setErr("Wrong code. Try a 6-digit code from your authenticator, or a recovery code."),
  });

  if (status.isLoading) return null;
  const s = status.data;

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="font-medium mb-1">Two-factor authentication</div>
      <p className="text-sm text-slate-500 mb-4">
        Use an authenticator app (Google Authenticator, 1Password, Authy, etc.)
        for a 6-digit code on every sign-in.
        {s?.required && !s.enrolled && (
          <span className="text-orange-700 font-medium">
            {" "}Admin accounts should enable this.
          </span>
        )}
      </p>

      {recoveryCodes && (
        <div className="mb-4 p-3 border border-amber-400 bg-amber-50 rounded">
          <div className="font-medium text-amber-900 mb-1">Save these recovery codes</div>
          <p className="text-xs text-amber-800 mb-2">
            Each works once if you lose your authenticator. We won't show them again.
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm">
            {recoveryCodes.map((c) => (<span key={c}>{c}</span>))}
          </div>
          <button
            className="mt-3 text-xs underline"
            onClick={() => setRecoveryCodes(null)}
          >
            I've saved them
          </button>
        </div>
      )}

      {s?.enrolled ? (
        <div className="space-y-3">
          <div className="text-sm text-green-700">
            Enabled{s.enrolledAt ? ` since ${new Date(s.enrolledAt).toLocaleDateString()}` : ""}.
          </div>
          <div className="text-sm">
            To turn off, enter a current 6-digit code (or a recovery code):
          </div>
          <input
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder="123 456"
            className="border rounded px-3 py-2 w-48 tracking-widest"
          />
          <div>
            <button
              onClick={() => { setErr(null); disable.mutate(); }}
              disabled={!disableCode || disable.isPending}
              className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {disable.isPending ? "Disabling…" : "Disable 2FA"}
            </button>
          </div>
        </div>
      ) : enrol ? (
        <div className="space-y-3">
          <p className="text-sm">
            1. Scan this QR code with your authenticator app.
          </p>
          <img src={enrol.qrDataUrl} alt="Scan with authenticator app"
               className="border rounded w-48 h-48" />
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Or type the secret manually</summary>
            <code className="block mt-1 p-2 bg-slate-100 rounded">{enrol.secret}</code>
          </details>
          <p className="text-sm">2. Enter the 6-digit code your app shows to confirm:</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123 456"
            className="border rounded px-3 py-2 w-48 tracking-widest"
          />
          <div className="flex gap-3">
            <button
              onClick={() => { setErr(null); confirm.mutate(); }}
              disabled={code.length < 6 || confirm.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {confirm.isPending ? "Confirming…" : "Confirm and enable"}
            </button>
            <button
              onClick={() => { setEnrol(null); setCode(""); setErr(null); }}
              className="text-sm text-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => start.mutate()}
          disabled={start.isPending}
          className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {start.isPending ? "Starting…" : "Enable two-factor auth"}
        </button>
      )}

      {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
    </div>
  );
}

export function Profile() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phoneE164 ?? "");
  const [savedProfile, setSavedProfile] = useState(false);

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const updateProfile = useMutation({
    mutationFn: () =>
      api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name, phoneE164: phone || null }),
      }),
    onSuccess: () => { setSavedProfile(true); refreshUser(); },
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api("/users/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: oldPwd, newPassword: newPwd }),
      }),
    onSuccess: () => {
      setPwdMsg({ kind: "ok", text: "Password changed." });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    },
    onError: () => setPwdMsg({ kind: "err", text: "Could not change password — check current password and try again." }),
  });

  if (!user) return null;

  const phoneValid = phone === "" || /^\+[1-9]\d{6,14}$/.test(phone);
  const newPwdValid = newPwd.length >= 8 && newPwd === confirmPwd;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <div className="bg-white border rounded-lg p-6">
        <div className="font-medium mb-1">Account details</div>
        <div className="text-sm text-slate-500 mb-4">
          {user.email} · {user.role}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input value={name} onChange={(e) => { setName(e.target.value); setSavedProfile(false); }}
              className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Phone (E.164, e.g. +353…) — optional, used for SMS escalation</label>
            <input value={phone} onChange={(e) => { setPhone(e.target.value); setSavedProfile(false); }}
              placeholder="+353851234567" className="border rounded px-3 py-2 w-full" />
            {!phoneValid && <div className="text-xs text-red-600 mt-1">Must be in E.164 format (starts with +, digits only).</div>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateProfile.mutate()}
              disabled={!name.trim() || !phoneValid || updateProfile.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 disabled:opacity-50 text-sm"
            >
              {updateProfile.isPending ? "Saving…" : "Save"}
            </button>
            {savedProfile && <span className="text-sm text-green-700">Saved</span>}
          </div>
        </div>
      </div>

      <TwoFactorSection />

      <div className="bg-white border rounded-lg p-6">
        <div className="font-medium mb-1">Change password</div>
        <p className="text-sm text-slate-500 mb-4">
          Minimum 10 characters; must include at least three of: lowercase, uppercase, digit, symbol.
        </p>
        <div className="space-y-3">
          <input type="password" placeholder="Current password" value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)} className="border rounded px-3 py-2 w-full" />
          <input type="password" placeholder="New password (min 8 chars)" value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)} className="border rounded px-3 py-2 w-full" />
          <input type="password" placeholder="Confirm new password" value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)} className="border rounded px-3 py-2 w-full" />
          {confirmPwd !== "" && newPwd !== confirmPwd && (
            <div className="text-xs text-red-600">New passwords don't match.</div>
          )}
          <button
            onClick={() => { setPwdMsg(null); changePassword.mutate(); }}
            disabled={!oldPwd || !newPwdValid || changePassword.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 disabled:opacity-50 text-sm"
          >
            {changePassword.isPending ? "Updating…" : "Change password"}
          </button>
          {pwdMsg && (
            <div className={`text-sm ${pwdMsg.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
              {pwdMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
