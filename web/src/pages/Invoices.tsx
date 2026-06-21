import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Invoices — the Business billing register, one screen:
 *   List with status filter chips → log a draft → mark Sent / Paid / Void.
 * Mirrors the Maintenance jobs board pattern (list + modal detail + dialogs)
 * and the established table/pill/btn conventions in index.css. Amounts are
 * stored as integer minor units (amountCents) and formatted with Intl.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export interface Invoice {
  id: string;
  organisationId: string;
  number: string;
  customerName: string;
  buildingId: string | null;
  jobId: string | null;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** Format integer minor units as a currency string, e.g. 123400 → €1,234.00. */
function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
    }).format(cents / 100);
  } catch {
    // Unknown / malformed currency code — fall back to a plain euro-style format.
    return `€${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  paid: "pill-online", // emerald
  overdue: "pill-alert", // red
  sent: "pill-info", // blue
  draft: "pill-muted", // muted
  void: "pill-muted", // grey
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

type Filter = "all" | InvoiceStatus;
const FILTERS: Filter[] = ["all", "draft", "sent", "paid", "overdue", "void"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", ...STATUS_LABEL };

// ─── Page ────────────────────────────────────────────────────────────────────

export function Invoices() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const status = filter === "all" ? undefined : filter;
  const invoicesQ = useQuery({
    queryKey: ["invoices", status],
    queryFn: () =>
      api<{ invoices: Invoice[] }>(`/invoices${status ? `?status=${status}` : ""}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["invoices"] });

  // Per-row status change (mark Sent / Paid / Void). Refetches every invoices
  // query on success so the list + any open filter reflect the new status.
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      api<{ invoice: Invoice }>(`/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
  });

  const invoices = invoicesQ.data?.invoices ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Raise, send and reconcile customer invoices.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <PlusIcon /> New invoice
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1 mb-5 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1.5 rounded-lg font-medium transition " +
              (filter === f ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")
            }
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {invoicesQ.isLoading ? (
        <div className="text-slate-500">Loading invoices…</div>
      ) : invoicesQ.error ? (
        <div className="text-red-600">Could not load invoices.</div>
      ) : invoices.length === 0 ? (
        <Empty>
          {filter === "all" ? (
            <>No invoices yet. Tap <em>New invoice</em> to raise your first one.</>
          ) : (
            <>No {FILTER_LABEL[filter].toLowerCase()} invoices.</>
          )}
        </Empty>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2">Number</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Due</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-200/80">
                    <td className="p-2">
                      <button
                        onClick={() => setOpenId(inv.id)}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {inv.number}
                      </button>
                    </td>
                    <td className="p-2 text-slate-700">{inv.customerName}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap text-slate-900">
                      {formatAmount(inv.amountCents, inv.currency)}
                    </td>
                    <td className="p-2">
                      <span className={STATUS_STYLE[inv.status]}>{STATUS_LABEL[inv.status]}</span>
                    </td>
                    <td className="p-2 whitespace-nowrap text-slate-500">{formatDate(inv.dueAt)}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === "draft" && (
                          <button
                            onClick={() => setStatus.mutate({ id: inv.id, status: "sent" })}
                            disabled={setStatus.isPending}
                            className="btn-ghost px-2 py-1 text-xs"
                          >
                            Mark sent
                          </button>
                        )}
                        {(inv.status === "sent" || inv.status === "overdue") && (
                          <button
                            onClick={() => setStatus.mutate({ id: inv.id, status: "paid" })}
                            disabled={setStatus.isPending}
                            className="btn-ghost px-2 py-1 text-xs"
                          >
                            Mark paid
                          </button>
                        )}
                        {inv.status !== "void" && inv.status !== "paid" && (
                          <button
                            onClick={() => setStatus.mutate({ id: inv.id, status: "void" })}
                            disabled={setStatus.isPending}
                            className="btn-danger px-2 py-1 text-xs"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <CreateInvoiceDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            invalidate();
            setCreating(false);
          }}
        />
      )}
      {openId && (
        <InvoiceDrawer
          invoiceId={openId}
          onClose={() => setOpenId(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────────────────

function InvoiceDrawer({
  invoiceId,
  onClose,
  onChanged,
}: {
  invoiceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api<{ invoice: Invoice }>(`/invoices/${invoiceId}`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    onChanged();
  };
  const setStatus = useMutation({
    mutationFn: (status: InvoiceStatus) =>
      api<{ invoice: Invoice }>(`/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: refresh,
  });

  const inv = detailQ.data?.invoice;

  return (
    <Drawer onClose={onClose} title={inv ? `Invoice ${inv.number}` : "Invoice"}>
      {!inv ? (
        <div className="px-6 py-8 text-slate-500">Loading…</div>
      ) : (
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-2">
            <span className={STATUS_STYLE[inv.status]}>{STATUS_LABEL[inv.status]}</span>
          </div>

          <div>
            <div className="text-3xl font-semibold tabular-nums text-slate-900">
              {formatAmount(inv.amountCents, inv.currency)}
            </div>
            <div className="text-sm text-slate-500 mt-0.5">{inv.customerName}</div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail label="Issued" value={formatDate(inv.issuedAt)} />
            <Detail label="Due" value={formatDate(inv.dueAt)} />
            <Detail label="Paid" value={formatDate(inv.paidAt)} />
            <Detail label="Created" value={formatDate(inv.createdAt)} />
          </dl>

          {inv.notes && (
            <div>
              <div className="field-label">Notes</div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{inv.notes}</p>
            </div>
          )}

          {/* Status actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {inv.status === "draft" && (
              <button onClick={() => setStatus.mutate("sent")} disabled={setStatus.isPending} className="btn-primary">
                Mark sent
              </button>
            )}
            {(inv.status === "sent" || inv.status === "overdue") && (
              <button onClick={() => setStatus.mutate("paid")} disabled={setStatus.isPending} className="btn-primary">
                Mark paid
              </button>
            )}
            {inv.status !== "void" && inv.status !== "paid" && (
              <button onClick={() => setStatus.mutate("void")} disabled={setStatus.isPending} className="btn-danger">
                Void invoice
              </button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── Create dialog ───────────────────────────────────────────────────────────

function CreateInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");

  const amountCents = Math.round(Number(amount) * 100);
  const amountValid = amount.trim() !== "" && Number.isFinite(amountCents) && amountCents > 0;

  const save = useMutation({
    mutationFn: () =>
      api<{ invoice: Invoice }>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerName: customerName.trim(),
          amountCents,
          currency,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          notes: notes.trim() || undefined,
        }),
      }),
    onSuccess: onCreated,
  });

  return (
    <Modal onClose={onClose} title="New invoice">
      <div className="px-6 py-5 space-y-4">
        <Field label="Customer">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            autoFocus
            className="input"
            placeholder="e.g. Acme Facilities Ltd"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="input"
              placeholder="1234.00"
            />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="USD">USD ($)</option>
            </select>
          </Field>
        </div>
        <Field label="Due date (optional)">
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input" />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input resize-none"
            placeholder="Line items, PO reference, payment terms…"
          />
        </Field>
        {save.error && <p className="text-sm text-red-700">Couldn't create the invoice — try again.</p>}
      </div>
      <Footer
        onClose={onClose}
        onSave={() => save.mutate()}
        saveLabel="Create invoice"
        disabled={!customerName.trim() || !amountValid || save.isPending}
      />
    </Modal>
  );
}

// ─── Shared bits (local copies of the Maintenance page's primitives) ──────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full border-l border-slate-300 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-medium text-slate-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Footer({
  onClose,
  onSave,
  saveLabel,
  disabled,
}: {
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
      <button onClick={onClose} className="btn-ghost">Cancel</button>
      <button onClick={onSave} disabled={disabled} className="btn-primary">{saveLabel}</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 text-sm">
      {children}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
