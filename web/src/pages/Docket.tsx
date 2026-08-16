import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login completion docket (app.hazardlink.ie/docket/:token).
 * The contractor fills it in on their phone when the work is done: outcome,
 * work carried out, parts, time on site, photo/video evidence, further
 * repairs (optionally offering to quote), a safety declaration and a drawn
 * signature. Mirrors the design mock section for section.
 */

interface DocketLocation {
  assetName: string;
  assetSerial: string | null;
  assetMake: string | null;
  assetModel: string | null;
  floorName: string | null;
  floorPlanUrl: string | null;
  pin: { x: number; y: number } | null;
}
interface MediaItem { url: string; kind: string; label: string }
interface DocketInfo {
  orgName: string;
  contractorName: string | null;
  jobTitle: string;
  jobDescription: string | null;
  buildingName: string | null;
  location: DocketLocation | null;
  permitRef: string | null;
  submitted: boolean;
  docket: any;
}

const OUTCOMES = [
  { key: "fixed", label: "Fixed" },
  { key: "temporary_fix", label: "Temporary fix, return needed" },
  { key: "not_completed", label: "Could not complete" },
];

function SectionCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-[13px] font-bold text-slate-800">
        {n} · {title}
      </div>
      <div className="px-3.5 py-3 space-y-3">{children}</div>
    </div>
  );
}

/** Minimal draw-to-sign canvas; exports a PNG data URL. */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drew = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    c.width = c.offsetWidth * 2;
    c.height = 140;
    const g = c.getContext("2d")!;
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.strokeStyle = "#1e293b";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    const g = ref.current!.getContext("2d")!;
    const p = pos(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const g = ref.current!.getContext("2d")!;
    const p = pos(e);
    g.lineTo(p.x, p.y);
    g.stroke();
    drew.current = true;
  };
  const up = () => {
    drawing.current = false;
    if (drew.current) onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drew.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        className="w-full h-[70px] border border-slate-300 rounded-lg bg-slate-50 touch-none"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      />
      <button type="button" onClick={clear} className="text-xs text-slate-500 mt-1 underline">Clear signature</button>
    </div>
  );
}

export function Docket() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<DocketInfo | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [outcome, setOutcome] = useState("");
  const [backInService, setBackInService] = useState(true);
  const [workDone, setWorkDone] = useState("");
  const [parts, setParts] = useState<Array<{ name: string; qty: number }>>([]);
  const [partName, setPartName] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [arrived, setArrived] = useState("");
  const [left, setLeft] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [further, setFurther] = useState(false);
  const [furtherDetails, setFurtherDetails] = useState("");
  const [furtherUrgency, setFurtherUrgency] = useState("routine");
  const [wantsQuote, setWantsQuote] = useState(false);
  const [safety, setSafety] = useState("");
  const [methodConfirmed, setMethodConfirmed] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/docket/${token}`))
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d: DocketInfo) => {
        if (!alive) return;
        setInfo(d);
        setMedia((d.docket?.media as MediaItem[]) || []);
      })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [token]);

  async function upload(file: File, label: string) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("label", label);
      fd.append("file", file);
      const r = await fetch(apiUrl(`/public/docket/${token}/media`), { method: "POST", body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "upload_failed");
      setMedia(body.media || []);
    } catch (e: any) {
      setErr(String(e.message) === "file_too_large"
        ? "That file is too big. Photos and short clips only."
        : "Upload failed. Try again on better signal.");
    } finally {
      setUploading(false);
    }
  }

  const addPart = () => {
    const n = partName.trim();
    if (!n) return;
    setParts((p) => [...p, { name: n, qty: Math.max(1, Number(partQty) || 1) }]);
    setPartName("");
    setPartQty("1");
  };

  const canSubmit = !!outcome && workDone.trim().length >= 5 && methodConfirmed
    && signedName.trim().length >= 2 && !!signature
    && (!further || furtherDetails.trim().length > 0);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/public/docket/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome,
          backInService,
          workDone: workDone.trim(),
          parts,
          arrivedTime: arrived || undefined,
          leftTime: left || undefined,
          furtherRepairs: further,
          furtherDetails: further ? furtherDetails.trim() : undefined,
          furtherUrgency: further ? furtherUrgency : undefined,
          wantsQuote: further && wantsQuote,
          safetyConcerns: safety.trim() || undefined,
          methodConfirmed,
          signedName: signedName.trim(),
          signatureDataUrl: signature,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "failed");
      setDone(true);
    } catch (e: any) {
      setErr(String(e.message) === "already_submitted"
        ? "This docket was already submitted."
        : "Could not submit. Check the required sections and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input = "w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔍</div>
          <h1 className="text-xl font-semibold text-slate-900">Link not found</h1>
          <p className="text-slate-600 mt-2">This docket link is invalid or has been replaced.</p>
        </div>
      </div>
    );
  }
  if (!info) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">Loading…</div>;
  }

  const doneScreen = done || info.submitted;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex justify-center p-3 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 text-white px-5 py-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Completion docket · {info.orgName}</div>
            <div className="text-base font-semibold mt-0.5 leading-snug">{info.jobTitle}</div>
            <div className="text-xs text-slate-300 mt-0.5">
              {[info.buildingName, info.contractorName].filter(Boolean).join(" · ")}
            </div>
          </div>

          {doneScreen ? (
            <div className="px-5 py-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-xl font-semibold text-slate-900">Docket complete</h1>
              <p className="text-slate-600 mt-2 text-sm">
                Thanks{info.contractorName ? `, ${info.contractorName}` : ""} — {info.orgName} has the record
                {info.docket?.furtherRepairs ? ", and the further repairs you flagged are logged" : ""}.
              </p>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-3.5">
              {info.location && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
                    <div className="text-sm font-medium">{info.location.assetName}</div>
                    <div className="text-xs text-slate-500">
                      {[info.location.assetMake, info.location.assetModel].filter(Boolean).join(" ")}
                      {info.location.assetSerial ? ` · Serial ${info.location.assetSerial}` : ""}
                      {info.location.floorName ? ` · ${info.location.floorName}` : ""}
                    </div>
                  </div>
                  {info.location.floorPlanUrl && info.location.pin && (
                    <div className="relative">
                      <img src={info.location.floorPlanUrl} alt="Floor plan" className="w-full block" />
                      <div className="absolute -translate-x-1/2 -translate-y-full"
                           style={{ left: `${info.location.pin.x * 100}%`, top: `${info.location.pin.y * 100}%` }}>
                        <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow mx-auto" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <SectionCard n={1} title="Outcome">
                <div className="text-[13px] font-semibold">Is the issue fully resolved?</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {OUTCOMES.map((o) => (
                    <button key={o.key} type="button" onClick={() => setOutcome(o.key)}
                      className={"px-1.5 py-2 rounded-lg border text-[11.5px] leading-tight " +
                        (outcome === o.key ? "border-emerald-600 bg-emerald-50 text-emerald-700 font-bold" : "border-slate-300 text-slate-500")}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between text-[13px] font-semibold">
                  Is the asset back in service?
                  <input type="checkbox" checked={backInService} onChange={(e) => setBackInService(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
                </label>
              </SectionCard>

              <SectionCard n={2} title="Work carried out">
                <textarea value={workDone} onChange={(e) => setWorkDone(e.target.value)} rows={3} maxLength={4000}
                  placeholder="What did you do? Plain words are perfect." className={input} />
              </SectionCard>

              <SectionCard n={3} title="Parts and materials used">
                {parts.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="font-semibold">× {p.qty}
                      <button type="button" className="text-red-500 ml-2" onClick={() => setParts(parts.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Part or material" className={input} />
                  <input value={partQty} onChange={(e) => setPartQty(e.target.value)} type="number" min={1} className={input + " w-16 shrink-0"} />
                  <button type="button" onClick={addPart} className="px-3 rounded-lg bg-slate-800 text-white text-sm font-semibold shrink-0">Add</button>
                </div>
              </SectionCard>

              <SectionCard n={4} title="Time on site">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-500">Arrived
                    <input type="time" value={arrived} onChange={(e) => setArrived(e.target.value)} className={input + " mt-1"} />
                  </label>
                  <label className="text-xs text-slate-500">Left
                    <input type="time" value={left} onChange={(e) => setLeft(e.target.value)} className={input + " mt-1"} />
                  </label>
                </div>
              </SectionCard>

              <SectionCard n={5} title="Photos and video">
                <div className="grid grid-cols-4 gap-2">
                  {media.map((m, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden bg-slate-200 relative">
                      {m.kind === "photo"
                        ? <img src={m.url} alt={m.label} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xl">▶</div>}
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-extrabold bg-white/90 rounded px-1 uppercase">{m.label}</span>
                    </div>
                  ))}
                  {(["before", "after", "video"] as const).map((label) => (
                    <label key={label} className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 cursor-pointer">
                      <span className="text-lg leading-none">+</span>
                      <span className="text-[8px] font-bold uppercase mt-0.5">{label}</span>
                      <input type="file" hidden accept={label === "video" ? "video/*" : "image/*"}
                        capture="environment"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, label); e.target.value = ""; }} />
                    </label>
                  ))}
                </div>
                {uploading && <p className="text-xs text-slate-500">Uploading…</p>}
                <p className="text-[11px] text-slate-400">Before and after photos make the record solid. Each is stamped on upload.</p>
              </SectionCard>

              <SectionCard n={6} title="Further repairs found?">
                <label className="flex items-center justify-between text-[13px] font-semibold">
                  Anything else needs attention?
                  <input type="checkbox" checked={further} onChange={(e) => setFurther(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
                </label>
                {further && (
                  <>
                    <textarea value={furtherDetails} onChange={(e) => setFurtherDetails(e.target.value)} rows={2} maxLength={2000}
                      placeholder="What did you find, and where?" className={input} />
                    <label className="text-xs text-slate-500 block">How urgent?
                      <select value={furtherUrgency} onChange={(e) => setFurtherUrgency(e.target.value)} className={input + " mt-1"}>
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={wantsQuote} onChange={(e) => setWantsQuote(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                      I can quote for this work
                    </label>
                    <p className="text-[11px] text-slate-400">Goes straight to the client as a logged job{wantsQuote ? " with a quote request back to you" : ""}. Nothing gets lost on a paper docket.</p>
                  </>
                )}
              </SectionCard>

              <SectionCard n={7} title="Safety">
                <textarea value={safety} onChange={(e) => setSafety(e.target.value)} rows={2} maxLength={2000}
                  placeholder="Any health and safety concerns found on site? Leave blank if none." className={input} />
                <label className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" checked={methodConfirmed} onChange={(e) => setMethodConfirmed(e.target.checked)} className="w-4 h-4 mt-0.5 accent-emerald-600" />
                  <span>Work carried out as per the agreed method{info.permitRef ? ` and permit ${info.permitRef}` : ""}, and the area was left safe and tidy.</span>
                </label>
              </SectionCard>

              <SectionCard n={8} title="Sign-off">
                <input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Your name" maxLength={120} className={input} />
                <SignaturePad onChange={setSignature} />
                <p className="text-[11px] text-slate-400">I confirm the work described was carried out by me or under my supervision.</p>
              </SectionCard>

              {err && <p className="text-sm text-red-600">{err}</p>}
              <button onClick={submit} disabled={!canSubmit || submitting}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold transition">
                {submitting ? "Sending…" : "Submit docket"}
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Powered by HazardLink</p>
      </div>
    </div>
  );
}
