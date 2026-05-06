import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
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
    onSuccess: () => setSavedProfile(true),
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
              className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50 text-sm"
            >
              {updateProfile.isPending ? "Saving…" : "Save"}
            </button>
            {savedProfile && <span className="text-sm text-green-700">Saved</span>}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <div className="font-medium mb-1">Change password</div>
        <p className="text-sm text-slate-500 mb-4">Minimum 8 characters.</p>
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
            className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50 text-sm"
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
