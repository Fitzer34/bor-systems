import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login page a contractor lands on from the magic link we email when
 * a PPM is due (app.hazardlink.ie/schedule/:token). They pick a date they can
 * carry out the work, or decline. White-labelled: the client's company name is
 * front and centre, HazardLink is just the footer.
 *
 * Standalone light theme on purpose — this is the one screen an outside
 * contractor sees, so it reads as a clean booking page, not our dark dashboard.
 */

interface ScheduleInfo {
  orgName: string;
  title: string;
  notes: string | null;
  frequencyPerYear: number;
  contractorName: string | null;
  siteName: string | null;
  siteAddress: string | null;
  siteContactName: string | null;
  siteContactPhone: string | null;
  siteContactEmail: string | null;
  status: "sent" | "proposed" | "confirmed" | "declined" | "cancelled";
  proposedDate: string | null;
  confirmedDate: string | null;
  contractorNote: string | null;
  expired: boolean;
}

function freqLabel(n: number): string {
  return ({ 1: "once a year", 2: "twice a year", 3: "3× a year", 4: "quarterly", 6: "every 2 months", 12: "monthly" } as Record<number, string>)[n] ?? `${n}× a year`;
}

function prettyDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const todayISO = new Date().toISOString().slice(0, 10);

export function SchedulePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ScheduleInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "proposed" | "declined">(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/ppm-schedule/${token}`))
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "load_failed");
        return r.json();
      })
      .then((d: ScheduleInfo) => { if (alive) { setInfo(d); setDate(d.proposedDate ?? ""); } })
      .catch((e) => { if (alive) setLoadError(String(e.message || e)); });
    return () => { alive = false; };
  }, [token]);

  async function submit(payload: { date?: string; note?: string; decline?: boolean }) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(apiUrl(`/public/ppm-schedule/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "submit_failed");
      setDone(payload.decline ? "declined" : "proposed");
    } catch (e: any) {
      const msg = String(e.message || e);
      setSubmitError(
        msg === "expired" ? "This link has expired — please contact the company directly." :
        msg === "already_confirmed" ? "This visit has already been confirmed." :
        msg === "cancelled" ? "This request was withdrawn — please contact the company." :
        msg === "date_in_past" ? "Please choose a date that isn't in the past." :
        msg === "date_required" ? "Please choose a date first." :
        "Something went wrong — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* ─── states ─────────────────────────────────────────────── */}
          {loadError ? (
            <Pad>
              <Icon>🔍</Icon>
              <h1 className="text-xl font-semibold text-slate-900">Link not found</h1>
              <p className="text-slate-600 mt-2">
                This scheduling link is invalid or has expired. Please contact the company that sent it.
              </p>
            </Pad>
          ) : !info ? (
            <Pad><p className="text-slate-500 text-center py-8">Loading…</p></Pad>
          ) : done ? (
            <Pad>
              <Icon>{done === "declined" ? "👍" : "✅"}</Icon>
              <h1 className="text-xl font-semibold text-slate-900">
                {done === "declined" ? "Thanks for letting us know" : "Date sent!"}
              </h1>
              <p className="text-slate-600 mt-2">
                {done === "declined"
                  ? `We've told ${info.orgName} you can't take this on right now.`
                  : `We've sent your date to ${info.orgName}. They'll confirm shortly — you don't need to do anything else.`}
              </p>
            </Pad>
          ) : info.status === "confirmed" ? (
            <Pad>
              <Icon>✅</Icon>
              <h1 className="text-xl font-semibold text-slate-900">You're booked in</h1>
              <p className="text-slate-600 mt-2">
                <span className="font-medium">{info.title}</span> is confirmed for{" "}
                <span className="font-medium text-slate-900">{prettyDate(info.confirmedDate)}</span>.
              </p>
            </Pad>
          ) : info.status === "cancelled" || info.expired ? (
            <Pad>
              <Icon>⌛</Icon>
              <h1 className="text-xl font-semibold text-slate-900">This request is closed</h1>
              <p className="text-slate-600 mt-2">
                Please contact {info.orgName} directly to arrange a date.
              </p>
            </Pad>
          ) : (
            <>
              {/* Header — white-label: client's company name leads. */}
              <div className="bg-slate-900 text-white px-6 py-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">Scheduling request from</div>
                <div className="text-lg font-semibold mt-0.5">{info.orgName}</div>
              </div>

              <div className="px-6 py-5">
                <p className="text-slate-700">
                  {info.contractorName ? `Hi ${info.contractorName} — ` : ""}please pick a date you can carry out:
                </p>

                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <div className="font-semibold text-slate-900">{info.title}</div>
                  <div className="text-sm text-slate-500 mt-0.5">Recurs {freqLabel(info.frequencyPerYear)}</div>
                  {info.notes && <div className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{info.notes}</div>}
                  {info.siteName && (
                    <div className="text-sm text-slate-700 mt-2">
                      📍 <span className="font-medium">{info.siteName}</span>{info.siteAddress ? `, ${info.siteAddress}` : ""}
                    </div>
                  )}
                  {(info.siteContactName || info.siteContactPhone || info.siteContactEmail) && (
                    <div className="text-sm text-slate-700 mt-1">
                      👤 On-site contact: {[info.siteContactName, info.siteContactPhone, info.siteContactEmail].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>

                {info.status === "proposed" && (
                  <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    You suggested {prettyDate(info.proposedDate)}. You can change it below until it's confirmed.
                  </p>
                )}

                {!declining ? (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">What date suits you?</label>
                      <input
                        type="date"
                        value={date}
                        min={todayISO}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Anything to add? (optional)</label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="e.g. mornings work best, I'll need parking"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>

                    {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                    <button
                      onClick={() => submit({ date, note: note.trim() || undefined })}
                      disabled={!date || submitting}
                      className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-semibold text-base transition"
                    >
                      {submitting ? "Sending…" : "Confirm this date"}
                    </button>
                    <button
                      onClick={() => setDeclining(true)}
                      className="w-full text-sm text-slate-500 hover:text-slate-700"
                    >
                      I can't take this on
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <p className="text-slate-700">No problem. Want to add a quick note for {info.orgName}?</p>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="e.g. fully booked this month"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                    {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                    <button
                      onClick={() => submit({ decline: true, note: note.trim() || undefined })}
                      disabled={submitting}
                      className="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-semibold transition"
                    >
                      {submitting ? "Sending…" : "Send — I can't take this on"}
                    </button>
                    <button onClick={() => { setDeclining(false); setSubmitError(null); }} className="w-full text-sm text-slate-500 hover:text-slate-700">
                      ← Back
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Powered by HazardLink</p>
      </div>
    </div>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-8 text-center">{children}</div>;
}
function Icon({ children }: { children: React.ReactNode }) {
  return <div className="text-4xl mb-3">{children}</div>;
}
