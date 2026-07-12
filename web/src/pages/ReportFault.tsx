import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login page any worker opens by scanning an asset's "report a fault"
 * QR (app.hazardlink.ie/report/:token). Two taps: describe the fault, send. It
 * lands as a maintenance job against that asset + site. The cross-discipline
 * moat — a cleaner or guard can raise maintenance from one shared scan.
 *
 * The same route also serves two friendlier public variants (same backend, same
 * POST payload) selected by query string:
 *   ?mode=washroom  "How is this washroom?" with big tap targets for the
 *                   public (needs cleaning / restock / spill / broken / other)
 *   ?mode=resident  "Report an issue" for residents/tenants
 * With no mode, the original fault-report flow is unchanged.
 */

interface ReportInfo {
  orgName: string;
  assetName: string;
  buildingName: string | null;
}

type Urgency = "routine" | "urgent" | "emergency";

interface QuickOption {
  label: string;
  /** Description prefill sent in the standard fault-report payload. */
  prefill: string;
  urgency: Urgency;
}

const MODE_CONFIG: Record<"washroom" | "resident", { title: string; sub: string; options: QuickOption[] }> = {
  washroom: {
    title: "How is this washroom?",
    sub: "Tap the option that fits. It goes straight to the facilities team.",
    options: [
      { label: "Needs cleaning", prefill: "Washroom: needs cleaning", urgency: "routine" },
      { label: "Restock supplies", prefill: "Washroom: restock supplies (soap, paper…)", urgency: "routine" },
      { label: "Spill or wet floor", prefill: "Washroom: spill or wet floor", urgency: "urgent" },
      { label: "Something broken", prefill: "Washroom: something broken", urgency: "routine" },
      { label: "Other", prefill: "Washroom: other issue", urgency: "routine" },
    ],
  },
  resident: {
    title: "Report an issue",
    sub: "Tap the option that fits. The building team will pick it up.",
    options: [
      { label: "Cleaning", prefill: "Resident report: cleaning needed", urgency: "routine" },
      { label: "Repair needed", prefill: "Resident report: repair needed", urgency: "routine" },
      { label: "Security concern", prefill: "Resident report: security concern", urgency: "urgent" },
      { label: "Other", prefill: "Resident report: other issue", urgency: "routine" },
    ],
  },
};

const NAME_KEY = "hazardlink.reporterName";

export function ReportFault() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const rawMode = params.get("mode");
  const mode: "washroom" | "resident" | null =
    rawMode === "washroom" || rawMode === "resident" ? rawMode : null;
  const cfg = mode ? MODE_CONFIG[mode] : null;

  const [info, setInfo] = useState<ReportInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState(localStorage.getItem(NAME_KEY) ?? "");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "emergency">("routine");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Quick-flow state (?mode=washroom / ?mode=resident)
  const [picked, setPicked] = useState<QuickOption | null>(null);
  const [details, setDetails] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/report/${token}`))
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d: ReportInfo) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [token]);

  async function submit() {
    setSubmitting(true);
    try {
      if (reporterName.trim()) localStorage.setItem(NAME_KEY, reporterName.trim());
      await fetch(apiUrl(`/public/report/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: description.trim(), reporterName: reporterName.trim() || undefined, urgency }),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  /** Quick-flow submit — same POST payload/fields as the standard flow; the
   *  tapped option supplies the description prefill and urgency. */
  async function submitQuick() {
    if (!picked) return;
    setSubmitting(true);
    try {
      const extra = details.trim();
      await fetch(apiUrl(`/public/report/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: extra ? `${picked.prefill}. ${extra}` : picked.prefill,
          urgency: picked.urgency,
        }),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  const urgencyBtn = (u: "routine" | "urgent" | "emergency", label: string) => (
    <button type="button" onClick={() => setUrgency(u)}
      className={"flex-1 py-2.5 rounded-lg text-sm font-medium border transition " + (urgency === u
        ? (u === "emergency" ? "bg-red-600 text-white border-red-600" : u === "urgent" ? "bg-amber-500 text-white border-amber-500" : "bg-slate-700 text-white border-slate-700")
        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400")}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loadError ? (
            <div className="px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Not found</h1>
              <p className="text-slate-600 mt-2">This QR is invalid or no longer active.</p>
            </div>
          ) : !info ? (
            <p className="text-slate-500 text-center py-10">Loading…</p>
          ) : done ? (
            <div className="px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reported — thanks!</h1>
              <p className="text-slate-600 mt-2">{info.orgName} has been notified about {info.assetName}. No need to do anything else.</p>
            </div>
          ) : cfg ? (
            <>
              <div className="bg-slate-900 text-white px-6 py-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">{info.orgName}</div>
                <div className="text-xl font-semibold mt-0.5">{cfg.title}</div>
                <div className="text-sm text-slate-300 mt-0.5">
                  {info.assetName}
                  {info.buildingName ? ` · ${info.buildingName}` : ""}
                </div>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-slate-500">{cfg.sub}</p>
                <div className="grid grid-cols-1 gap-2">
                  {cfg.options.map((o) => (
                    <button key={o.label} type="button" onClick={() => setPicked(o)}
                      className={"w-full px-4 py-4 rounded-xl border text-left text-base font-semibold transition " +
                        (picked?.label === o.label
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-800 border-slate-300 hover:border-slate-400 active:bg-slate-50")}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {picked && (
                  <>
                    <div>
                      <label className="field-label">Anything else we should know? (optional)</label>
                      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={1500}
                        placeholder={mode === "washroom" ? "e.g. second cubicle, near the sinks…" : "e.g. third floor corridor, by the lift…"}
                        className="input resize-none" />
                    </div>
                    <button onClick={submitQuick} disabled={submitting}
                      className="btn-primary w-full py-3 text-base">
                      {submitting ? "Sending…" : "Send report"}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-900 text-white px-6 py-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">{info.orgName} · Report a fault</div>
                <div className="text-lg font-semibold mt-0.5">{info.assetName}</div>
                {info.buildingName && <div className="text-sm text-slate-300 mt-0.5">{info.buildingName}</div>}
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="field-label">What's wrong?</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} autoFocus
                    placeholder="e.g. Leaking from the base, won't switch on…"
                    className="input resize-none" />
                </div>
                <div>
                  <label className="field-label">How urgent?</label>
                  <div className="flex gap-2">{urgencyBtn("routine", "Routine")}{urgencyBtn("urgent", "Urgent")}{urgencyBtn("emergency", "Emergency")}</div>
                </div>
                <div>
                  <label className="field-label">Your name (optional)</label>
                  <input value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="e.g. J. Murphy"
                    className="input" />
                </div>
                <button onClick={submit} disabled={submitting || !description.trim()}
                  className="btn-primary w-full">
                  {submitting ? "Sending…" : "Report it"}
                </button>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Powered by HazardLink</p>
      </div>
    </div>
  );
}
