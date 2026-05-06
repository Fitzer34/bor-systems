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
}

export function Users() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "cleaner" as UserRow["role"], phoneE164: "" });
  const [err, setErr] = useState<string | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: UserRow[] }>("/users") });
  const create = useMutation({
    mutationFn: () => api("/users", {
      method: "POST",
      body: JSON.stringify({
        email: form.email,
        name: form.name,
        password: form.password,
        role: form.role,
        phoneE164: form.phoneE164 || undefined,
      }),
    }),
    onSuccess: () => {
      setForm({ email: "", name: "", password: "", role: "cleaner", phoneE164: "" });
      setErr(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => setErr("Could not create user (email may already exist or password too short)."),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/users/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const erase = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>

      {isAdmin && (
        <div className="mb-8 bg-white border rounded-lg p-4">
          <div className="font-medium mb-3">Create user</div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2" />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded px-3 py-2" />
            <input placeholder="Password (min 8 chars)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="border rounded px-3 py-2" />
            <input placeholder="Phone (E.164, e.g. +353…)" value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} className="border rounded px-3 py-2" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRow["role"] })} className="border rounded px-3 py-2">
              <option value="cleaner">Cleaner</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() => create.mutate()}
              disabled={!form.email || !form.name || form.password.length < 8 || create.isPending}
              className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create user"}
            </button>
          </div>
          {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
        </div>
      )}

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
                {u.deactivatedAt ? <span className="text-slate-400">deactivated</span> :
                  u.onDuty ? <span className="text-green-700">on duty</span> :
                  <span className="text-slate-500">off duty</span>}
              </td>
              <td className="p-2 text-right space-x-3">
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
  );
}
