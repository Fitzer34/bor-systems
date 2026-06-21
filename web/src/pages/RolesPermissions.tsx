import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  usePermissions,
  type Role,
} from "../lib/permissions";

/* ─── Roles & permissions (admin) ─────────────────────────────────────────────
 *
 * A matrix for tuning what each non-admin role can see (module visibility) and
 * do (sensitive actions). Admin is locked to "full" and cannot be edited. Loads
 * the effective per-role maps + the key catalogue from GET /permissions; saves a
 * role's full map via PUT /permissions/:role.
 *
 * "Preview as role" drives the PermissionsProvider so the admin can watch the
 * sidebar collapse to exactly what that role would see — using the *in-flight*
 * edits, so toggling a module off and previewing immediately reflects it.
 */

type RoleKey = Role; // "admin" | "supervisor" | "cleaner"

interface PermissionsResponse {
  roles: Record<RoleKey, Record<string, boolean>>;
  catalogue: { modules: string[]; actions: string[] };
}

interface UsersResponse {
  users: { id: string; role: RoleKey }[];
}

/** "cleaner" → "Field staff" in the UI only (DB enum unchanged). */
const ROLE_LABEL: Record<RoleKey, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  cleaner: "Field staff",
};

/** Roles shown as editable rows, in order. Admin handled separately (locked). */
const EDITABLE_ROLES: RoleKey[] = ["supervisor", "cleaner"];

/** Human labels + helper text for each catalogue key. */
const KEY_META: Record<string, { label: string; hint: string }> = {
  "module.operations": { label: "Operations", hint: "Live alerts, dispatch, schedules, floor plans" },
  "module.maintenance": { label: "Maintenance", hint: "Jobs, assets, meters, parts, PPMs" },
  "module.compliance": { label: "Compliance & safety", hint: "SDS, inspections, incidents, checkpoints" },
  "module.business": { label: "Business", hint: "Tenders, quotes, cost & contractor admin" },
  "module.insights": { label: "Insights", hint: "Analytics, KPIs, reports" },
  "module.admin": { label: "Admin", hint: "Users, settings, notifications, audit" },
  "action.approve_permits": { label: "Approve permits", hint: "Approve work permits / job scopes" },
  "action.approve_quotes": { label: "Approve quotes", hint: "Award a quote / approve a tender" },
  "action.edit_compliance": { label: "Edit compliance records", hint: "Edit SDS / certifications / inspections" },
  "action.manage_devices": { label: "Manage devices", hint: "Register / decommission sensors & gateways" },
  "action.manage_automations": { label: "Manage automations", hint: "Configure automation & reminder rules" },
  "action.export_reports": { label: "Export reports", hint: "Download CSV / PDF exports" },
  "action.manage_users": { label: "Manage users", hint: "Create / deactivate / delete staff" },
  "action.manage_billing": { label: "Manage billing", hint: "Change plan / billing" },
  "action.delete_records": { label: "Delete records", hint: "Hard-delete records" },
};

function meta(key: string) {
  return KEY_META[key] ?? { label: key, hint: "" };
}

export function RolesPermissions() {
  const qc = useQueryClient();
  const { previewAs, clearPreview, previewRole, isPreviewing } = usePermissions();

  const perms = useQuery<PermissionsResponse>({
    queryKey: ["permissions"],
    queryFn: () => api("/permissions"),
  });
  // User counts per role (nice-to-have; degrade quietly if it fails).
  const usersQ = useQuery<UsersResponse>({
    queryKey: ["users"],
    queryFn: () => api("/users"),
  });

  // Local editable draft of each editable role's map. Seeded from the server,
  // re-seeded whenever the server data changes (e.g. after a save refetch).
  const [draft, setDraft] = useState<Record<RoleKey, Record<string, boolean>>>(
    {} as Record<RoleKey, Record<string, boolean>>,
  );
  const [savedRole, setSavedRole] = useState<RoleKey | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!perms.data) return;
    setDraft({
      admin: { ...perms.data.roles.admin },
      supervisor: { ...perms.data.roles.supervisor },
      cleaner: { ...perms.data.roles.cleaner },
    });
  }, [perms.data]);

  // Keep the live preview map in sync with the draft so toggling a module off
  // while previewing that role updates the sidebar immediately.
  useEffect(() => {
    if (previewRole && previewRole !== "admin" && draft[previewRole]) {
      previewAs(previewRole, draft[previewRole]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, previewRole]);

  // Exit preview when leaving the page so the admin's own view is restored.
  useEffect(() => () => clearPreview(), [clearPreview]);

  const counts = useMemo(() => {
    const c: Record<RoleKey, number> = { admin: 0, supervisor: 0, cleaner: 0 };
    for (const u of usersQ.data?.users ?? []) {
      if (u.role in c) c[u.role] += 1;
    }
    return c;
  }, [usersQ.data]);

  const save = useMutation({
    mutationFn: (role: RoleKey) =>
      api(`/permissions/${role}`, {
        method: "PUT",
        body: JSON.stringify({ permissions: draft[role] }),
      }),
    onSuccess: (_data, role) => {
      setSavedRole(role);
      setErr(null);
      qc.invalidateQueries({ queryKey: ["permissions"] });
      // Refresh /users/me so the admin's own effective perms stay current
      // (no-op for admin, but correct if they ever edit their own row's basis).
      window.setTimeout(() => setSavedRole(null), 2500);
    },
    onError: () => setErr("Could not save. Check your connection and try again."),
  });

  function toggle(role: RoleKey, key: string) {
    setDraft((d) => ({ ...d, [role]: { ...d[role], [key]: !d[role]?.[key] } }));
    setSavedRole(null);
  }

  if (perms.isLoading) {
    return <div className="p-2 text-slate-500">Loading permissions…</div>;
  }
  if (perms.isError || !perms.data) {
    return (
      <div className="card p-6 text-sm text-red-600">
        Could not load permissions. You may not have access, or the server is unreachable.
      </div>
    );
  }

  const { catalogue } = perms.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Control what each role can see and do. Changes apply to every user
            with that role in your organisation. Admins always have full access.
          </p>
        </div>
        <PreviewControl
          previewRole={previewRole}
          isPreviewing={isPreviewing}
          onPreview={(r) => (r ? previewAs(r, draft[r]) : clearPreview())}
        />
      </div>

      {isPreviewing && previewRole && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center justify-between gap-3">
          <span>
            Previewing the app as <strong>{ROLE_LABEL[previewRole]}</strong>. The sidebar now
            shows only what this role can see. Your own access is unchanged.
          </span>
          <button onClick={clearPreview} className="btn-secondary shrink-0">
            Exit preview
          </button>
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}

      <Section
        title="Module visibility"
        subtitle="Which sections of the app each role can open."
        keys={catalogue.modules}
        draft={draft}
        counts={counts}
        savedRole={savedRole}
        saving={save.isPending}
        onToggle={toggle}
        onSave={(r) => { setErr(null); save.mutate(r); }}
      />

      <Section
        title="Sensitive actions"
        subtitle="Privileged operations a role may perform. Leave off for view-only roles."
        keys={catalogue.actions}
        draft={draft}
        counts={counts}
        savedRole={savedRole}
        saving={save.isPending}
        onToggle={toggle}
        onSave={(r) => { setErr(null); save.mutate(r); }}
      />
    </div>
  );
}

function PreviewControl({
  previewRole,
  isPreviewing,
  onPreview,
}: {
  previewRole: Role | null;
  isPreviewing: boolean;
  onPreview: (role: RoleKey | null) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Preview as</span>
      <select
        value={isPreviewing && previewRole ? previewRole : "admin"}
        onChange={(e) => {
          const v = e.target.value as RoleKey;
          onPreview(v === "admin" ? null : v);
        }}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      >
        <option value="admin">My view (Admin)</option>
        <option value="supervisor">Supervisor</option>
        <option value="cleaner">Field staff</option>
      </select>
    </label>
  );
}

function Section({
  title,
  subtitle,
  keys,
  draft,
  counts,
  savedRole,
  saving,
  onToggle,
  onSave,
}: {
  title: string;
  subtitle: string;
  keys: string[];
  draft: Record<RoleKey, Record<string, boolean>>;
  counts: Record<RoleKey, number>;
  savedRole: RoleKey | null;
  saving: boolean;
  onToggle: (role: RoleKey, key: string) => void;
  onSave: (role: RoleKey) => void;
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="font-semibold text-slate-900">{title}</div>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left font-medium px-5 py-3 w-1/2">Capability</th>
              <th className="text-center font-medium px-4 py-3">
                Admin
                <div className="text-[11px] font-normal text-slate-400">{counts.admin} {counts.admin === 1 ? "user" : "users"}</div>
              </th>
              <th className="text-center font-medium px-4 py-3">
                Supervisor
                <div className="text-[11px] font-normal text-slate-400">{counts.supervisor} {counts.supervisor === 1 ? "user" : "users"}</div>
              </th>
              <th className="text-center font-medium px-4 py-3">
                Field staff
                <div className="text-[11px] font-normal text-slate-400">{counts.cleaner} {counts.cleaner === 1 ? "user" : "users"}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const m = meta(key);
              return (
                <tr key={key} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 align-top">
                    <div className="font-medium text-slate-800">{m.label}</div>
                    {m.hint && <div className="text-xs text-slate-500">{m.hint}</div>}
                  </td>
                  {/* Admin column — always on, locked. */}
                  <td className="px-4 py-3 text-center">
                    <Toggle checked disabled label={`Admin: ${m.label}`} />
                  </td>
                  {EDITABLE_ROLES.map((role) => (
                    <td key={role} className="px-4 py-3 text-center">
                      <Toggle
                        checked={!!draft[role]?.[key]}
                        onChange={() => onToggle(role, key)}
                        label={`${ROLE_LABEL[role]}: ${m.label}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
        {EDITABLE_ROLES.map((role) => (
          <div key={role} className="flex items-center gap-2">
            {savedRole === role && <span className="text-xs text-green-700">Saved</span>}
            <button
              onClick={() => onSave(role)}
              disabled={saving}
              className="btn-secondary"
            >
              {saving ? "Saving…" : `Save ${ROLE_LABEL[role]}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Accessible on/off switch. Disabled = locked (admin). */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={
        "relative inline-flex h-5 w-9 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50 focus-visible:ring-offset-2 " +
        (checked ? "bg-blue-600" : "bg-slate-300") +
        (disabled ? " opacity-60 cursor-not-allowed" : " cursor-pointer")
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition " +
          (checked ? "translate-x-4" : "translate-x-0.5")
        }
      />
    </button>
  );
}
