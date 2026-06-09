import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";
import { type Hanger } from "./Hangers";

/**
 * Sign Tags — the small BLE + UWB modules embedded in a wet-floor sign's
 * handle (Qorvo DWM3001). Each pairs to a hanger so the mobile apps' AirTag-
 * style "Find sign" feature knows which tag to range against when a spill
 * alert fires.
 *
 * Unlike gateways/hangers, tags don't self-register (the bare Qorvo firmware
 * has no WiFi/cloud path), so an admin registers them here: enter the tag's
 * advertised BLE name + UWB address, then pair it to a hanger.
 */

export interface SignTag {
  id: string;
  bleUuid: string;
  uwbAddress: string;
  pairedHangerId: string | null;
  batteryPct: number | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export function SignTags() {
  useTicker(1000);
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "supervisor";

  const tagsQ = useQuery({
    queryKey: ["sign-tags"],
    queryFn: () => api<{ tags: SignTag[] }>("/sign-tags"),
    refetchInterval: 15_000,
  });
  const hangersQ = useQuery({
    queryKey: ["hangers"],
    queryFn: () => api<{ hangers: Hanger[] }>("/hangers"),
  });

  const [editing, setEditing] = useState<SignTag | null>(null);
  const [registering, setRegistering] = useState(false);

  const hangers = hangersQ.data?.hangers ?? [];
  const hangerLabel = (id: string | null): string => {
    if (!id) return "Unpaired";
    const h = hangers.find((x) => x.id === id);
    if (!h) return "Unknown hanger";
    return h.name?.trim() || `Hanger ${h.devEui.slice(-4)}`;
  };

  if (tagsQ.isLoading) {
    return <div className="p-8 text-slate-400">Loading sign tags…</div>;
  }
  if (tagsQ.error) {
    return <div className="p-8 text-red-400">Could not load sign tags.</div>;
  }

  const list = tagsQ.data?.tags ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Sign tags</h1>
          <p className="text-sm text-slate-400 mt-1">
            UWB finder tags inside the signs. Pair one to a hanger so{" "}
            <span className="font-medium">Find sign</span> in the app walks
            staff straight to it.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setRegistering(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white font-medium whitespace-nowrap"
          >
            + Register tag
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-slate-200">No sign tags registered yet.</p>
          <p className="text-sm text-slate-400 mt-2">
            Flash a Qorvo DWM3001 tag, then{" "}
            {isAdmin ? (
              <>tap <em>Register tag</em> above</>
            ) : (
              <>ask an admin to register it</>
            )}{" "}
            and pair it to the hanger it lives on.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t) => (
            <SignTagCard
              key={t.id}
              tag={t}
              hangerLabel={hangerLabel(t.pairedHangerId)}
              isStaff={isStaff}
              onClick={() => isStaff && setEditing(t)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SignTagEditDialog
          tag={editing}
          hangers={hangers}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["sign-tags"] });
            setEditing(null);
          }}
        />
      )}

      {registering && (
        <RegisterSignTagDialog
          hangers={hangers}
          onClose={() => setRegistering(false)}
          onRegistered={() => {
            qc.invalidateQueries({ queryKey: ["sign-tags"] });
            setRegistering(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────

interface CardProps {
  tag: SignTag;
  hangerLabel: string;
  isStaff: boolean;
  onClick: () => void;
}

function SignTagCard({ tag, hangerLabel, isStaff, onClick }: CardProps) {
  const paired = !!tag.pairedHangerId;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isStaff}
      className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/40 enabled:hover:bg-slate-900/70 enabled:hover:border-slate-700 transition p-4 enabled:cursor-pointer disabled:opacity-90"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-medium text-slate-100 truncate">{tag.bleUuid}</h3>
            <span
              className={
                "px-2 py-0.5 text-xs font-medium rounded-full " +
                (paired
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-500/15 text-slate-300")
              }
            >
              {paired ? "Paired" : "Unpaired"}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">UWB {tag.uwbAddress}</p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <Field label="Hanger" value={hangerLabel} />
            {tag.batteryPct !== null && (
              <Field label="Battery" value={`${tag.batteryPct}%`} />
            )}
            <Field
              label="Last seen"
              value={tag.lastSeenAt ? relativeTime(tag.lastSeenAt) : "never"}
            />
          </div>
        </div>
        {isStaff && (
          <div className="text-slate-400 text-xs whitespace-nowrap shrink-0">
            Tap to edit →
          </div>
        )}
      </div>
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-slate-400">{label}:</span>{" "}
      <span className="text-slate-100">{value}</span>
    </span>
  );
}

// ─── Register dialog ────────────────────────────────────────────────────────

function RegisterSignTagDialog({
  hangers,
  onClose,
  onRegistered,
}: {
  hangers: Hanger[];
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [bleUuid, setBleUuid] = useState("");
  const [uwbAddress, setUwbAddress] = useState("");
  const [pairedHangerId, setPairedHangerId] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bleOk = bleUuid.trim().length >= 8;
  const uwbOk = /^[0-9A-Fa-f]{8,16}$/.test(uwbAddress.trim());

  const create = useMutation({
    mutationFn: () =>
      api<SignTag>("/sign-tags", {
        method: "POST",
        body: JSON.stringify({
          bleUuid: bleUuid.trim(),
          uwbAddress: uwbAddress.trim(),
          pairedHangerId: pairedHangerId || undefined,
        }),
      }),
    onSuccess: onRegistered,
  });

  return (
    <DialogShell title="Register sign tag" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <FieldGroup
          label="BLE name"
          hint="The name the tag advertises — you'll see it in the Qorvo Nearby Interaction app's device list (e.g. “Qorvo NI”). The phone matches the tag by this."
        >
          <input
            type="text"
            value={bleUuid}
            onChange={(e) => setBleUuid(e.target.value)}
            maxLength={64}
            placeholder="Qorvo NI"
            className={inputCls}
          />
        </FieldGroup>

        <FieldGroup
          label="UWB address"
          hint="8–16 hex characters. The tag's UWB MAC (or any unique hex id for now)."
        >
          <input
            type="text"
            value={uwbAddress}
            onChange={(e) => setUwbAddress(e.target.value)}
            maxLength={16}
            placeholder="0102030405060708"
            className={inputCls + " font-mono"}
          />
        </FieldGroup>

        <FieldGroup label="Pair to hanger (optional)">
          <select
            value={pairedHangerId}
            onChange={(e) => setPairedHangerId(e.target.value)}
            className={inputCls}
          >
            <option value="">— Pair later —</option>
            {hangers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name?.trim() || `Hanger ${h.devEui.slice(-4)}`} ({h.devEui})
              </option>
            ))}
          </select>
        </FieldGroup>

        {create.error && (
          <p className="text-sm text-red-400">{registerErrorText(create.error)}</p>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
          Cancel
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={!bleOk || !uwbOk || create.isPending}
          className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-white font-medium"
        >
          {create.isPending ? "Registering…" : "Register"}
        </button>
      </div>
    </DialogShell>
  );
}

// ─── Edit dialog (pair / unpair / delete) ──────────────────────────────────

function SignTagEditDialog({
  tag,
  hangers,
  isAdmin,
  onClose,
  onSaved,
}: {
  tag: SignTag;
  hangers: Hanger[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pairedHangerId, setPairedHangerId] = useState(tag.pairedHangerId ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () =>
      api(`/sign-tags/${tag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pairedHangerId: pairedHangerId || null }),
      }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => api(`/sign-tags/${tag.id}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  const hasChanges = pairedHangerId !== (tag.pairedHangerId ?? "");

  return (
    <DialogShell title="Sign tag" onClose={onClose}>
      <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
        <Section title="Identification">
          <ReadRow label="BLE name" value={tag.bleUuid} />
          <ReadRow label="UWB address" value={tag.uwbAddress} mono />
          <ReadRow label="Battery" value={tag.batteryPct !== null ? `${tag.batteryPct}%` : "—"} />
          <ReadRow label="Last seen" value={tag.lastSeenAt ? relativeTime(tag.lastSeenAt) : "never"} />
        </Section>

        <Section title="Pairing">
          <FieldGroup
            label="Paired hanger"
            hint="The hanger this sign normally hangs on. Find sign uses this to map an alert to this tag."
          >
            <select
              value={pairedHangerId}
              onChange={(e) => setPairedHangerId(e.target.value)}
              className={inputCls}
            >
              <option value="">— Unpaired —</option>
              {hangers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name?.trim() || `Hanger ${h.devEui.slice(-4)}`} ({h.devEui})
                </option>
              ))}
            </select>
          </FieldGroup>
        </Section>

        {save.error && <p className="text-sm text-red-400">{registerErrorText(save.error)}</p>}
        {remove.error && <p className="text-sm text-red-400">Couldn't remove tag — try again.</p>}
      </div>

      <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
        {isAdmin ? (
          confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">Remove this tag?</span>
              <button
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-slate-700 rounded text-white"
              >
                {remove.isPending ? "Removing…" : "Confirm"}
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded"
            >
              Remove tag
            </button>
          )
        ) : <span />}
        <div className="flex gap-2 ml-auto">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
            Close
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!hasChanges || save.isPending}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 rounded text-white font-medium"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm";

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 rounded-xl w-full max-w-lg border border-slate-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-slate-400">{label}</span>
      <span className={"text-slate-100 text-right break-all " + (mono ? "font-mono" : "")}>{value}</span>
    </div>
  );
}

function registerErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    const code = (err.payload as { error?: string })?.error;
    if (code === "tag_already_registered") return "That BLE name or UWB address is already registered.";
    if (code === "hanger_not_in_org") return "That hanger isn't in your organisation.";
    if (code === "invalid_input") return "Check the BLE name (≥8 chars) and UWB address (8–16 hex).";
  }
  return "Couldn't save — try again.";
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
