import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login page a contractor opens from their tender email
 * (app.hazardlink.ie/quote/:token). Shows the job and lets them submit a price
 * + earliest start date. White-label booking-page style.
 */

interface QuoteLocation {
  assetName: string;
  assetSerial: string | null;
  assetMake: string | null;
  assetModel: string | null;
  floorName: string | null;
  floorPlanUrl: string | null;
  pin: { x: number; y: number } | null;
}

interface QuoteInfo {
  orgName: string;
  contractorName: string | null;
  jobTitle: string;
  jobDescription: string | null;
  buildingName: string | null;
  location: QuoteLocation | null;
  status: string;
  amountCents: number | null;
  proposedStartDate: string | null;
  canSubmit: boolean;
}

/** The floor plan with the asset pin — shows the contractor exactly where the
 *  fault is before they set foot on site. */
function LocationCard({ loc }: { loc: QuoteLocation }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="text-sm font-medium text-slate-800">{loc.assetName}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {[loc.assetMake, loc.assetModel].filter(Boolean).join(" ")}
          {loc.assetSerial ? ` · Serial ${loc.assetSerial}` : ""}
          {loc.floorName ? ` · ${loc.floorName}` : ""}
        </div>
      </div>
      {loc.floorPlanUrl && loc.pin ? (
        <div className="relative">
          <img src={loc.floorPlanUrl} alt={`Floor plan${loc.floorName ? ` of ${loc.floorName}` : ""}`} className="w-full block" />
          <div
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${loc.pin.x * 100}%`, top: `${loc.pin.y * 100}%` }}
          >
            <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow-lg animate-pulse mx-auto" />
            <div className="text-[10px] font-bold text-white bg-red-500 rounded px-1.5 py-0.5 mt-0.5 shadow">HERE</div>
          </div>
        </div>
      ) : loc.floorPlanUrl ? (
        <img src={loc.floorPlanUrl} alt={`Floor plan${loc.floorName ? ` of ${loc.floorName}` : ""}`} className="w-full block" />
      ) : null}
    </div>
  );
}

export function QuoteSubmit() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<QuoteInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/quote/${token}`))
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d: QuoteInfo) => {
        if (!alive) return;
        setInfo(d);
        if (d.amountCents != null) setAmount(String(d.amountCents / 100));
        if (d.proposedStartDate) setStartDate(d.proposedStartDate);
      })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [token]);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/public/quote/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: Math.round(Number(amount) * 100), proposedStartDate: startDate || undefined, notes: notes.trim() || undefined }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "failed");
      setDone(true);
    } catch (e: any) {
      setErr(String(e.message) === "closed" ? "This tender has closed." : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {loadError ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h1 className="text-xl font-semibold text-slate-900">Link not found</h1>
              <p className="text-slate-600 mt-2">This quote link is invalid or has expired.</p>
            </div>
          ) : !info ? (
            <p className="text-slate-500 text-center py-10">Loading…</p>
          ) : done ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-xl font-semibold text-slate-900">Quote submitted</h1>
              <p className="text-slate-600 mt-2">Thanks{info.contractorName ? `, ${info.contractorName}` : ""} — {info.orgName} has your quote and will be in touch.</p>
            </div>
          ) : !info.canSubmit ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">⌛</div>
              <h1 className="text-xl font-semibold text-slate-900">This tender is closed</h1>
              <p className="text-slate-600 mt-2">Please contact {info.orgName} directly.</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-900 text-white px-6 py-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">Quote request from {info.orgName}</div>
                <div className="text-lg font-semibold mt-0.5">{info.jobTitle}</div>
                {info.buildingName && <div className="text-sm text-slate-300 mt-0.5">{info.buildingName}</div>}
              </div>
              <div className="px-6 py-5 space-y-4">
                {info.jobDescription && (
                  <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 whitespace-pre-wrap">{info.jobDescription}</div>
                )}
                {info.location && <LocationCard loc={info.location} />}
                {info.status === "submitted" && <p className="text-sm text-emerald-700">You've already quoted — you can update it below until it's decided.</p>}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your price (€)</label>
                  <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
                    placeholder="e.g. 450" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Earliest start date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                    placeholder="Anything the client should know" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button onClick={submit} disabled={submitting || !amount.trim()}
                  className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-semibold transition">
                  {submitting ? "Sending…" : "Submit quote"}
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
