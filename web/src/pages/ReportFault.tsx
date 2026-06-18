import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login page any worker opens by scanning an asset's "report a fault"
 * QR (app.hazardlink.ie/report/:token). Two taps: describe the fault, send. It
 * lands as a maintenance job against that asset + site. The cross-discipline
 * moat — a cleaner or guard can raise maintenance from one shared scan.
 */

interface ReportInfo {
  orgName: string;
  assetName: string;
  buildingName: string | null;
}

const NAME_KEY = "hazardlink.reporterName";

export function ReportFault() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ReportInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState(localStorage.getItem(NAME_KEY) ?? "");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "emergency">("routine");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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
