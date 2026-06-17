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
    <button onClick={() => setUrgency(u)}
      className={"flex-1 py-2 rounded-lg text-sm font-semibold border " + (urgency === u
        ? (u === "emergency" ? "bg-red-600 text-white border-red-600" : u === "urgent" ? "bg-amber-500 text-white border-amber-500" : "bg-slate-700 text-white border-slate-700")
        : "bg-white text-slate-700 border-slate-300")}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {loadError ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h1 className="text-xl font-semibold text-slate-900">Not found</h1>
              <p className="text-slate-600 mt-2">This QR is invalid or no longer active.</p>
            </div>
          ) : !info ? (
            <p className="text-slate-500 text-center py-10">Loading…</p>
          ) : done ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-xl font-semibold text-slate-900">Reported — thanks!</h1>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">What's wrong?</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} autoFocus
                    placeholder="e.g. Leaking from the base, won't switch on…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">How urgent?</label>
                  <div className="flex gap-2">{urgencyBtn("routine", "Routine")}{urgencyBtn("urgent", "Urgent")}{urgencyBtn("emergency", "Emergency")}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your name (optional)</label>
                  <input value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="e.g. J. Murphy"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <button onClick={submit} disabled={submitting || !description.trim()}
                  className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-semibold transition">
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
