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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
        body: JSON.stringify({ guardName: guardName.trim() || undefined, note: note.trim() || undefined, flagged, photoUrl: photoUrl || undefined }),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadArea(f: File) {
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(apiUrl(`/public/checkpoint/${token}/photo`), { method: "POST", body: fd });
      if (!r.ok) throw new Error("upload failed");
      const d = (await r.json()) as { url: string };
      setPhotoUrl(d.url);
    } catch {
      /* leave photo unset so they can retry */
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface text-slate-700 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="card !rounded-2xl !p-0 shadow-xl overflow-hidden">
          {loadError ? (
            <div className="px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Checkpoint not found</h1>
              <p className="text-slate-600 mt-2">This QR is invalid or no longer active.</p>
            </div>
          ) : !info ? (
            <p className="text-slate-500 text-center py-10">Loading…</p>
          ) : done ? (
            <div className="px-6 py-8 text-center">
              <div className={"mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full " + (flagged ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                {flagged ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
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
                  <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2.5 flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>
                    <span>{info.instructions}</span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
                  <input value={guardName} onChange={(e) => setGuardName(e.target.value)} placeholder="e.g. J. Murphy"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/40 focus:border-blue-500" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFlagged(false)}
                    className={"inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition " + (!flagged ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    All clear
                  </button>
                  <button onClick={() => setFlagged(true)}
                    className={"inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition " + (flagged ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                    Flag an issue
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Note {flagged ? "(what's wrong?)" : "(optional)"}</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                    placeholder={flagged ? "Describe the issue" : "Anything to note"}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600/40 focus:border-blue-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Photo of the area {flagged ? "(recommended)" : "(optional)"}</label>
                  {photoUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={photoUrl} alt="area" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                      <button type="button" onClick={() => setPhotoUrl(null)} className="text-sm text-slate-500 hover:text-slate-800">Remove</button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-slate-300 text-slate-600 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingPhoto}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadArea(f); }} />
                      {uploadingPhoto ? "Uploading…" : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                          Add a photo
                        </>
                      )}
                    </label>
                  )}
                </div>

                <button onClick={submit} disabled={submitting || (flagged && !note.trim())}
                  className="btn-primary w-full py-3">
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
