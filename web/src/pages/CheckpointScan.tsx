import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login page a guard's phone opens when they scan a checkpoint QR
 * (app.hazardlink.ie/c/:token). Shows the checkpoint + its instructions, then
 * logs the scan (all-clear or flagged, with an optional note). Standalone light
 * theme, like the contractor booking page.
 */

interface CheckpointInfo {
  orgName: string;
  name: string;
  locationNote: string | null;
  instructions: string | null;
  buildingName: string | null;
}

const GUARD_KEY = "hazardlink.guardName";

export function CheckpointScan() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<CheckpointInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [guardName, setGuardName] = useState(localStorage.getItem(GUARD_KEY) ?? "");
  const [note, setNote] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/checkpoint/${token}`))
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d: CheckpointInfo) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [token]);

  async function submit() {
    setSubmitting(true);
    try {
      if (guardName.trim()) localStorage.setItem(GUARD_KEY, guardName.trim());
      await fetch(apiUrl(`/public/checkpoint/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guardName: guardName.trim() || undefined, note: note.trim() || undefined, flagged }),
      });
      setDone(true);
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
              <h1 className="text-xl font-semibold text-slate-900">Checkpoint not found</h1>
              <p className="text-slate-600 mt-2">This QR is invalid or no longer active.</p>
            </div>
          ) : !info ? (
            <p className="text-slate-500 text-center py-10">Loading…</p>
          ) : done ? (
            <div className="px-6 py-8 text-center">
              <div className="text-4xl mb-3">{flagged ? "⚑" : "✅"}</div>
              <h1 className="text-xl font-semibold text-slate-900">Scan logged</h1>
              <p className="text-slate-600 mt-2">
                {info.name} — {flagged ? "issue flagged" : "all clear"}. Thanks{guardName.trim() ? `, ${guardName.trim()}` : ""}.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-slate-900 text-white px-6 py-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">{info.orgName} · Checkpoint</div>
                <div className="text-lg font-semibold mt-0.5">{info.name}</div>
                {(info.buildingName || info.locationNote) && (
                  <div className="text-sm text-slate-300 mt-0.5">{[info.buildingName, info.locationNote].filter(Boolean).join(" · ")}</div>
                )}
              </div>

              <div className="px-6 py-5 space-y-4">
                {info.instructions && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2.5">
                    📋 {info.instructions}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
                  <input value={guardName} onChange={(e) => setGuardName(e.target.value)} placeholder="e.g. J. Murphy"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFlagged(false)}
                    className={"py-2.5 rounded-lg text-sm font-semibold border " + (!flagged ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-300")}>
                    ✓ All clear
                  </button>
                  <button onClick={() => setFlagged(true)}
                    className={"py-2.5 rounded-lg text-sm font-semibold border " + (flagged ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-700 border-slate-300")}>
                    ⚑ Flag an issue
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Note {flagged ? "(what's wrong?)" : "(optional)"}</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                    placeholder={flagged ? "Describe the issue" : "Anything to note"}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>

                <button onClick={submit} disabled={submitting || (flagged && !note.trim())}
                  className="w-full py-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold transition">
                  {submitting ? "Logging…" : "Log this checkpoint"}
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
