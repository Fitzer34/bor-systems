import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "supervisor" | "cleaner";
  onDuty: boolean;
  deactivatedAt: string | null;
  invitedAt?: string | null;
  inviteAcceptedAt?: string | null;
}

interface CreateResult {
  user: UserRow;
  invited?: boolean;
  emailSent?: boolean;
  inviteUrl?: string;
}

type Notice = { kind: "ok"; text: string } | { kind: "link"; text: string; url: string };

export function Users() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [form, setForm] = useState({ email: "", name: "", role: "cleaner" as UserRow["role"], phoneE164: "" });
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: UserRow[] }>("/users") });

  const create = useMutation({
    mutationFn: () => api<CreateResult>("/users", {
      method: "POST",
      body: JSON.stringify({
        email: form.email,
        name: form.name,
        role: form.role,
        phoneE164: form.phoneE164 || undefined,
        sendInvite: true,
      }),
    }),
    onSuccess: (res) => {
      setForm({ email: "", name: "", role: "cleaner", phoneE164: "" });
      setErr(null);
      if (res.emailSent) {
        setNotice({ kind: "ok", text: `Invite emailed to ${res.user.email}. They'll set a password and be signed straight in.` });
      } else if (res.inviteUrl) {
        setNotice({ kind: "link", text: `User created, but email couldn't be sent. Share this private link with ${res.user.email}:`, url: res.inviteUrl });
      } else {
        setNotice({ kind: "ok", text: `${res.user.email} added.` });
      }
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: unknown) => {
      setNotice(null);
      const payload = (e as { payload?: unknown })?.payload;
      const reason = typeof payload === "object" && payload !== null && "error" in payload
        ? (payload as { error?: string }).error
        : undefined;
      const friendly: Record<string, string> = {
        email_taken: "Someone in your organisation already uses that email.",
        invalid_input: "One of the fields is invalid (check email format, phone in +country format).",
      };
      setErr(friendly[reason ?? ""] ?? "Could not add user.");
    },
  });

  const resend = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean; emailSent?: boolean; inviteUrl?: string }>(`/users/${id}/resend-invite`, { method: "POST" }),
    onSuccess: (res, id) => {
      const u = users.data?.users.find((x) => x.id === id);
      if (res.emailSent) setNotice({ kind: "ok", text: `Invite re-sent to ${u?.email ?? "the user"}.` });
      else if (res.inviteUrl) setNotice({ kind: "link", text: `Couldn't send email. Share this private link with ${u?.email ?? "the user"}:`, url: res.inviteUrl });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/users/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const erase = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const isPending = (u: UserRow) => !!u.invitedAt && !u.inviteAcceptedAt && !u.deactivatedAt;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>

      {isAdmin && (
        <div className="mb-8 bg-white border rounded-lg p-4">
          <div className="font-medium mb-1">Add a staff member</div>
          <div className="text-xs text-slate-500 mb-3">
            We'll email them a secure link to set their own password and sign in — no need to share one.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2" />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded px-3 py-2" />
            <input placeholder="Phone (E.164, e.g. +353…)" value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} className="border rounded px-3 py-2" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRow["role"] })} className="border rounded px-3 py-2">
              <option value="cleaner">Cleaner</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() => create.mutate()}
              disabled={!form.email || !form.name || create.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {create.isPending ? "Sending invite…" : "Send invite"}
            </button>
          </div>
          {notice && (
            <div className="mt-3 text-sm rounded border border-green-200 bg-green-50 text-green-800 px-3 py-2">
              <div>{notice.text}</div>
              {notice.kind === "link" && (
                <code className="block mt-1 break-all text-xs bg-white border rounded px-2 py-1 text-slate-700">{notice.url}</code>
              )}
            </div>
          )}
          {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
        </div>
      )}

      <div className="table-wrap">
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="p-2">Name</th>
            <th className="p-2">Email</th>
            <th className="p-2">Role</th>
            <th className="p-2">Status</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.data?.users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.name}</td>
              <td className="p-2 text-slate-500">{u.email}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2">
                {u.deactivatedAt ? <span className="text-slate-500">deactivated</span> :
                  isPending(u) ? <span className="text-amber-600">invited — pending</span> :
                  u.onDuty ? <span className="text-green-700">on duty</span> :
                  <span className="text-slate-500">off duty</span>}
              </td>
              <td className="p-2 text-right space-x-3">
                {isAdmin && isPending(u) && (
                  <button onClick={() => resend.mutate(u.id)} disabled={resend.isPending} className="text-blue-600 hover:underline disabled:opacity-50">Resend invite</button>
                )}
                {isAdmin && !u.deactivatedAt && u.id !== user?.id && (
                  <button onClick={() => deactivate.mutate(u.id)} className="text-amber-700 hover:underline">Deactivate</button>
                )}
                {isAdmin && u.id !== user?.id && (
                  <button onClick={() => { if (confirm(`Permanently erase ${u.name}?`)) erase.mutate(u.id); }} className="text-red-600 hover:underline">Erase (GDPR)</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
