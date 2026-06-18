import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Workforce competency — staff certifications / qualifications with expiry.
 * Track who's qualified for what (Gas Safe, working-at-heights, first aid, SIA…)
 * and surface tickets before they lapse.
 */

type Status = "valid" | "expiring" | "expired";
interface Cert {
  id: string; userId: string; name: string; issuer: string | null; reference: string | null;
  issuedOn: string | null; expiresOn: string | null; notes: string | null;
  userName: string | null; userRole: string | null;
  status: Status; daysToExpiry: number | null;
}
interface UserLite { id: string; name: string; role?: string; deactivatedAt?: string | null }

const RANK: Record<Status, number> = { expired: 0, expiring: 1, valid: 2 };
const STATUS_BADGE: Record<Status, string> = {
  expired: "pill-alert", expiring: "pill-offline", valid: "pill-online",
};
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function statusText(c: Cert): string {
  if (c.status === "expired") return `Expired ${c.daysToExpiry != null ? `${Math.abs(c.daysToExpiry)}d ago` : ""}`.trim();
  if (c.status === "expiring") return `Expires in ${c.daysToExpiry}d`;
  return c.expiresOn ? "Valid" : "No expiry";
}

export function Competency() {
  const qc = useQueryClient();
  const certsQ = useQuery({ queryKey: ["certifications"], queryFn: () => api<{ certifications: Cert[] }>("/certifications") });
  const usersQ = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: UserLite[] }>("/users") });
  const users = (usersQ.data?.users ?? []).filter((u) => !u.deactivatedAt);

  const [editing, setEditing] = useState<Cert | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["certifications"] });
  const del = useMutation({ mutationFn: (id: string) => api(`/certifications/${id}`, { method: "DELETE" }), onSuccess: invalidate });

  if (certsQ.isLoading) return <div className="p-8 text-slate-500">Loading certifications…</div>;
  if (certsQ.error) return <div className="p-8 text-red-600">Could not load certifications.</div>;

  const certs = [...(certsQ.data?.certifications ?? [])].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"),
  );
  const expired = certs.filter((c) => c.status === "expired").length;
  const expiring = certs.filter((c) => c.status === "expiring").length;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Competency</h1>
          <p className="text-sm text-slate-500 mt-1">Staff certifications &amp; qualifications, with expiry. Know who's qualified — and what's about to lapse.</p>
        </div>
        <button onClick={() => setCreating(true)} disabled={users.length === 0} className="btn-primary whitespace-nowrap">Add certification</button>
      </div>

      {(expired > 0 || expiring > 0) && (
        <div className="flex gap-2 mb-5 text-sm">
          {expired > 0 && <span className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200">{expired} expired</span>}
          {expiring > 0 && <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{expiring} expiring soon</span>}
        </div>
      )}

      {certs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-900 font-medium">No certifications logged yet.</p>
          <p className="text-sm text-slate-500 mt-1">{users.length === 0 ? "Add staff first, then record their tickets and qualifications." : "Record your team's tickets (Gas Safe, first aid, SIA licence…) and we'll flag what's expiring."}</p>
        </div>
      ) : (
        <div className="card !p-0 divide-y divide-slate-100">
          {certs.map((c) => (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className={STATUS_BADGE[c.status]}>{statusText(c)}</span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {c.userName ?? "—"}{c.userRole ? ` · ${c.userRole}` : ""}
                  {c.issuer ? ` · ${c.issuer}` : ""}
                  {c.expiresOn ? ` · expires ${fmtDate(c.expiresOn)}` : ""}
                  {c.reference ? ` · ${c.reference}` : ""}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setEditing(c)} className="btn-ghost">Edit</button>
                <button onClick={() => { if (window.confirm(`Delete "${c.name}" for ${c.userName}?`)) del.mutate(c.id); }} className="btn-danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <CertDialog cert={editing} users={users} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { invalidate(); setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

const inp = "input";

function CertDialog({ cert, users, onClose, onSaved }: { cert: Cert | null; users: UserLite[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!cert;
  const [userId, setUserId] = useState(cert?.userId ?? users[0]?.id ?? "");
  const [name, setName] = useState(cert?.name ?? "");
  const [issuer, setIssuer] = useState(cert?.issuer ?? "");
  const [reference, setReference] = useState(cert?.reference ?? "");
  const [issuedOn, setIssuedOn] = useState(cert?.issuedOn ?? "");
  const [expiresOn, setExpiresOn] = useState(cert?.expiresOn ?? "");
  const [notes, setNotes] = useState(cert?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bodyJson = () => JSON.stringify({
    ...(isEdit ? {} : { userId }),
    name: name.trim(),
    issuer: issuer.trim() || undefined,
    reference: reference.trim() || undefined,
    issuedOn: issuedOn || undefined,
    expiresOn: expiresOn || undefined,
    notes: notes.trim() || undefined,
  });
  const save = useMutation({
    mutationFn: () => isEdit
      ? api(`/certifications/${cert!.id}`, { method: "PATCH", body: bodyJson() })
      : api("/certifications", { method: "POST", body: bodyJson() }),
    onSuccess: onSaved,
    onError: () => setErr("Couldn't save — check the fields and try again."),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{isEdit ? "Edit certification" : "Add certification"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Group label="Staff member">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={isEdit} className={inp + (isEdit ? " opacity-60" : "")}>
              {isEdit && cert?.userName && <option value={cert.userId}>{cert.userName}</option>}
              {!isEdit && users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role ? ` · ${u.role}` : ""}</option>)}
            </select>
          </Group>
          <Group label="Certification / qualification">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={160} placeholder="e.g. Gas Safe, First Aid, SIA Door Supervisor" className={inp} />
          </Group>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Group label="Issuer (optional)"><input value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={160} placeholder="e.g. RGI, Solas" className={inp} /></Group>
            <Group label="Reference / number (optional)"><input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={160} className={inp} /></Group>
            <Group label="Issued"><input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className={inp} /></Group>
            <Group label="Expires"><input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inp} /></Group>
          </div>
          <Group label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className={inp + " resize-none"} />
          </Group>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => { setErr(null); save.mutate(); }} disabled={!userId || !name.trim() || save.isPending} className="btn-primary">{save.isPending ? "Saving…" : isEdit ? "Save" : "Add"}</button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}
