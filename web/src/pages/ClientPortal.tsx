import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login client portal (app.hazardlink.ie/portal/:token).
 * A building's client gets a live, read-only window into their site — open
 * jobs, recently completed work, statutory compliance counts, upcoming planned
 * maintenance — plus a "raise a request" form that logs a real job for the
 * facilities team. Mobile-first, since the link is shared by email.
 */

interface PortalJob {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface PortalData {
  portal: { clientName: string; buildingName: string; orgName: string };
  openJobs: PortalJob[];
  recentCompleted: Array<{ id: string; title: string; completedAt: string | null }>;
  compliance: { ok: number; dueSoon: number; overdue: number };
  upcomingPpms: Array<{ id: string; title: string; nextDueDate: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  logged: "Logged",
  scoped: "Being scoped",
  tendering: "Out to contractors",
  awarded: "Contractor booked",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

export function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Raise-a-request form
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl(`/public/portal/${token}`));
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      const r = await fetch(apiUrl(`/public/portal/${token}/request`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          details: details.trim() || undefined,
          priority: urgent ? "urgent" : "routine",
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSent(true);
      setTitle("");
      setDetails("");
      setUrgent(false);
      void load();
    } catch {
      setSendError("Could not send your request. Please try again, or contact your facilities team directly.");
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-2xl font-semibold text-slate-800 mb-2">This link is no longer active</div>
          <p className="text-slate-500">
            The portal link may have been revoked or replaced. Ask your facilities team for a new one.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
        Loading your site view…
      </div>
    );
  }

  const { portal, openJobs, recentCompleted, compliance, upcomingPpms } = data;
  const complianceTotal = compliance.ok + compliance.dueSoon + compliance.overdue;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">{portal.orgName} · Client portal</div>
          <h1 className="text-2xl font-semibold text-slate-900">{portal.buildingName}</h1>
          <p className="text-slate-500 mt-1">Live view for {portal.clientName}. Updated from the facilities system as work happens.</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 mt-6 space-y-6">
        {/* Raise a request */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Raise a request</h2>
          <p className="text-sm text-slate-500 mb-4">
            Goes straight to the facilities team as a logged job. You will see it appear under open work below.
          </p>
          {sent && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">
              Request sent. The facilities team has been notified and the job is now logged.
            </div>
          )}
          <form onSubmit={submitRequest} className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs attention? e.g. Leak in first-floor kitchenette"
              maxLength={200}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Any detail that helps: where exactly, since when, access notes… (optional)"
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="rounded" />
                This is urgent
              </label>
              <button
                type="submit"
                disabled={sending || !title.trim()}
                className="rounded-lg bg-blue-600 text-white text-sm font-medium px-5 py-2.5 disabled:opacity-50 hover:bg-blue-700"
              >
                {sending ? "Sending…" : "Send request"}
              </button>
            </div>
            {sendError && <div className="text-sm text-red-600">{sendError}</div>}
          </form>
        </section>

        {/* Open work */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Open work ({openJobs.length})</h2>
          {openJobs.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing open right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {openJobs.map((j) => (
                <li key={j.id} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{j.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Logged {formatDate(j.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {j.priority !== "routine" && (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">{j.priority}</span>
                    )}
                    <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-blue-50 text-blue-700">
                      {STATUS_LABELS[j.status] || j.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Compliance + planned maintenance */}
        <div className="grid sm:grid-cols-2 gap-6">
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Statutory compliance</h2>
            {complianceTotal === 0 ? (
              <p className="text-sm text-slate-400">No compliance items are tracked for this site yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Up to date</span><span className="font-semibold text-emerald-600">{compliance.ok}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Due within 30 days</span><span className="font-semibold text-amber-600">{compliance.dueSoon}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Overdue</span><span className={"font-semibold " + (compliance.overdue > 0 ? "text-red-600" : "text-slate-400")}>{compliance.overdue}</span></div>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Planned maintenance next 30 days</h2>
            {upcomingPpms.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing scheduled in the next 30 days.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcomingPpms.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span className="text-slate-700">{p.title}</span>
                    <span className="text-slate-400 shrink-0">{formatDate(p.nextDueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Recently completed */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Recently completed</h2>
          {recentCompleted.length === 0 ? (
            <p className="text-sm text-slate-400">Completed work will appear here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentCompleted.map((j) => (
                <li key={j.id} className="py-2.5 flex justify-between gap-3 text-sm">
                  <span className="text-slate-700">{j.title}</span>
                  <span className="text-slate-400 shrink-0">{formatDate(j.completedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-400 text-center pt-2">
          Powered by HazardLink. This page is read-only and private to the link holder.
        </p>
      </main>
    </div>
  );
}
