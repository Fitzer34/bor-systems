import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSection } from "../lib/section";

/**
 * Safety Data Sheets — the org's chemical library, filed by discipline. Scan a
 * product's barcode to find it (or pull its name); for a new product, upload the
 * actual SDS and Claude reads the hazards + listed components straight from that
 * document. Nothing is invented: AI-read records show "Needs review" until a
 * person confirms them.
 */

type Discipline = "cleaning" | "maintenance" | "security" | "general";
interface Stmt { code: string; text: string }
interface Ingredient { name: string; cas: string; percent: string }
interface SdsSheet {
  id: string; discipline: Discipline; barcode: string | null; productName: string;
  manufacturer: string | null; productCode: string | null; signalWord: string | null;
  pictograms: string[]; hazardStatements: Stmt[]; precautionaryStatements: Stmt[];
  ingredients: Ingredient[]; firstAid: string | null; storageHandling: string | null;
  ppe: string | null; sdsPdfUrl: string | null; issueDate: string | null; revisionDate: string | null;
  reviewDate: string | null; source: "ai_extraction" | "manual" | "provider";
  extractionWarnings: string[]; verified: boolean; verifiedAt: string | null; createdAt: string;
}
interface Extracted {
  isLikelySds: boolean; productName: string; manufacturer: string; productCode: string;
  signalWord: string; pictograms: string[]; hazardStatements: Stmt[]; precautionaryStatements: Stmt[];
  ingredients: Ingredient[]; firstAid: string; storageHandling: string; ppe: string;
  issueDate: string; revisionDate: string; warnings: string[];
}
interface ExtractResp { sdsPdfUrl: string; aiConfigured: boolean; extracted: Extracted | null; error?: string }
interface LookupResp {
  found: boolean; sheet?: SdsSheet; source?: string;
  identity?: { name: string; brand: string; source: string } | null; providerConfigured: boolean;
}

const DISCIPLINES: { v: Discipline; label: string }[] = [
  { v: "cleaning", label: "Cleaning" },
  { v: "maintenance", label: "Maintenance" },
  { v: "security", label: "Security" },
  { v: "general", label: "General" },
];
const inp = "input";

function signalCls(s: string | null | undefined): string {
  if (s === "Danger") return "bg-red-100 text-red-700";
  if (s === "Warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function Sds() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { section } = useSection();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  const [discipline, setDiscipline] = useState<Discipline | "all">(section ?? "all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<SdsSheet | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sds", discipline],
    queryFn: () => api<{ sheets: SdsSheet[] }>(`/sds${discipline === "all" ? "" : `?discipline=${discipline}`}`),
  });

  const sheets = useMemo(() => {
    const all = data?.sheets ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((s) =>
      s.productName.toLowerCase().includes(term) ||
      (s.manufacturer ?? "").toLowerCase().includes(term) ||
      (s.barcode ?? "").toLowerCase().includes(term));
  }, [data, q]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["sds"] });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Safety data sheets</h1>
          <p className="text-sm text-slate-500 mt-1">Scan a product to find its SDS, or add a new one from its sheet. Hazards are read from the sheet itself, never guessed.</p>
        </div>
        {isStaff && (
          <button onClick={() => setAdding(true)} className="btn-primary whitespace-nowrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 5V3M17 5V3" />
            </svg>
            Scan / add product
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setDiscipline("all")} className={"px-3 py-1.5 text-sm rounded-lg border " + (discipline === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300")}>All</button>
        {DISCIPLINES.map((d) => (
          <button key={d.v} onClick={() => setDiscipline(d.v)} className={"px-3 py-1.5 text-sm rounded-lg border " + (discipline === d.v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300")}>{d.label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand or barcode…" className={inp + " ml-auto max-w-xs"} />
      </div>

      {isLoading ? (
        <div className="p-8 text-slate-500">Loading sheets…</div>
      ) : error ? (
        <div className="p-8 text-red-600">Could not load safety data sheets.</div>
      ) : sheets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-slate-900 font-medium">No safety data sheets yet</div>
          <div className="text-sm text-slate-500 mt-1">{isStaff ? "Scan a product barcode or upload an SDS to start your library." : "Ask an admin to add the products used on your sites."}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map((s) => (
            <button key={s.id} onClick={() => setViewing(s)} className="card card-hover w-full text-left flex items-center gap-4">
              <span className={"px-2.5 py-1 text-xs font-semibold rounded-full shrink-0 " + signalCls(s.signalWord)}>{s.signalWord || "No signal"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 truncate">{s.productName}</div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {s.manufacturer ? s.manufacturer + " · " : ""}{DISCIPLINES.find((d) => d.v === s.discipline)?.label}
                  {s.barcode ? " · " + s.barcode : ""}{s.revisionDate ? " · rev " + fmtDate(s.revisionDate) : ""}
                </div>
              </div>
              {s.verified ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                  Verified
                </span>
              ) : (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">Needs review</span>
              )}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <AddSdsModal
          defaultDiscipline={section ?? "general"}
          onClose={() => setAdding(false)}
          onSaved={() => { refresh(); setAdding(false); }}
          onOpenExisting={(sheet) => { setAdding(false); setViewing(sheet); }}
        />
      )}
      {viewing && <DetailModal sheet={viewing} isStaff={isStaff} onClose={() => setViewing(null)} onChanged={() => { refresh(); setViewing(null); }} />}
    </div>
  );
}

// ─── Add / scan flow ─────────────────────────────────────────────────────────

interface Draft {
  discipline: Discipline; barcode: string; productName: string; manufacturer: string; productCode: string;
  signalWord: string; pictograms: string; hazardStatements: Stmt[]; ingredients: Ingredient[];
  firstAid: string; storageHandling: string; ppe: string; issueDate: string; revisionDate: string; reviewDate: string;
  sdsPdfUrl: string; source: "ai_extraction" | "manual" | "provider"; extractionWarnings: string[];
}
const emptyDraft = (d: Discipline): Draft => ({
  discipline: d, barcode: "", productName: "", manufacturer: "", productCode: "", signalWord: "",
  pictograms: "", hazardStatements: [], ingredients: [], firstAid: "", storageHandling: "", ppe: "",
  issueDate: "", revisionDate: "", reviewDate: "", sdsPdfUrl: "", source: "manual", extractionWarnings: [],
});

function AddSdsModal({ defaultDiscipline, onClose, onSaved, onOpenExisting }: {
  defaultDiscipline: Discipline; onClose: () => void; onSaved: () => void; onOpenExisting: (s: SdsSheet) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultDiscipline));
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lookup = useMutation({
    mutationFn: (barcode: string) => api<LookupResp>(`/sds/lookup?barcode=${encodeURIComponent(barcode)}`),
    onSuccess: (r) => {
      if (r.found && r.sheet) { onOpenExisting(r.sheet); return; }
      if (r.identity && (r.identity.name || r.identity.brand)) {
        setDraft((d) => ({ ...d, productName: d.productName || r.identity!.name, manufacturer: d.manufacturer || r.identity!.brand }));
        setLookupMsg(`Found "${r.identity.name || r.identity.brand}" via ${r.identity.source}. Now upload its SDS so the hazards come from the sheet.`);
      } else {
        setLookupMsg("Not in any product database — upload the SDS sheet and we'll read it.");
      }
    },
    onError: () => setLookupMsg("Lookup failed — you can still enter the product and upload its SDS."),
  });

  const onFile = async (file: File) => {
    setErr(null); setReading(true); setWarnings([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<ExtractResp>("/sds/extract", { method: "POST", body: fd });
      setDraft((d) => ({ ...d, sdsPdfUrl: r.sdsPdfUrl, source: r.extracted ? "ai_extraction" : d.source }));
      if (!r.aiConfigured) { setWarnings(["AI extraction isn't configured — the file is attached; enter the details manually."]); return; }
      const x = r.extracted;
      if (!x) { setWarnings([r.error === "extraction_failed" ? "Couldn't read that document — enter the details manually." : "No data read — enter the details manually."]); return; }
      if (!x.isLikelySds) { setWarnings(["This doesn't look like a Safety Data Sheet. Check the file, or enter the details manually."]); }
      setDraft((d) => ({
        ...d,
        productName: x.productName || d.productName,
        manufacturer: x.manufacturer || d.manufacturer,
        productCode: x.productCode || d.productCode,
        signalWord: x.signalWord || d.signalWord,
        pictograms: x.pictograms.length ? x.pictograms.join(", ") : d.pictograms,
        hazardStatements: x.hazardStatements.length ? x.hazardStatements : d.hazardStatements,
        ingredients: x.ingredients.length ? x.ingredients : d.ingredients,
        firstAid: x.firstAid || d.firstAid,
        storageHandling: x.storageHandling || d.storageHandling,
        ppe: x.ppe || d.ppe,
        issueDate: x.issueDate || d.issueDate,
        revisionDate: x.revisionDate || d.revisionDate,
        source: "ai_extraction",
        extractionWarnings: x.warnings,
      }));
      setWarnings(x.warnings);
      setConfirmed(false);
    } catch {
      setErr("Upload failed — check the file (PDF or photo) and try again.");
    } finally {
      setReading(false);
    }
  };

  const save = useMutation({
    mutationFn: () => api<{ sheet: SdsSheet }>("/sds", {
      method: "POST",
      body: JSON.stringify({
        discipline: draft.discipline,
        barcode: draft.barcode.trim() || null,
        productName: draft.productName.trim(),
        manufacturer: draft.manufacturer.trim() || null,
        productCode: draft.productCode.trim() || null,
        signalWord: draft.signalWord || null,
        pictograms: draft.pictograms.split(",").map((s) => s.trim()).filter(Boolean),
        hazardStatements: draft.hazardStatements.filter((h) => h.code || h.text),
        ingredients: draft.ingredients.filter((i) => i.name || i.cas),
        firstAid: draft.firstAid.trim() || null,
        storageHandling: draft.storageHandling.trim() || null,
        ppe: draft.ppe.trim() || null,
        sdsPdfUrl: draft.sdsPdfUrl || null,
        issueDate: draft.issueDate || null,
        revisionDate: draft.revisionDate || null,
        reviewDate: draft.reviewDate || null,
        source: draft.source,
        extractionWarnings: draft.extractionWarnings,
        verified: confirmed,
      }),
    }),
    onSuccess: onSaved,
    onError: (e: unknown) => {
      const payload = (e as { payload?: { error?: string; id?: string } })?.payload;
      if (payload?.error === "barcode_exists") setErr("That barcode is already in your library.");
      else setErr("Couldn't save — check the product name and try again.");
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Add a product SDS</h2>
          <select value={draft.discipline} onChange={(e) => set("discipline", e.target.value as Discipline)} className={inp + " w-auto"}>
            {DISCIPLINES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* 1 — barcode */}
          <div>
            <label className="field-label">Barcode</label>
            <div className="flex gap-2">
              <input value={draft.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Scan or type the product barcode" className={inp}
                onKeyDown={(e) => { if (e.key === "Enter" && draft.barcode.trim()) lookup.mutate(draft.barcode.trim()); }} />
              <ScanButton onDetected={(code) => { set("barcode", code); lookup.mutate(code); }} />
              <button onClick={() => draft.barcode.trim() && lookup.mutate(draft.barcode.trim())} disabled={lookup.isPending} className="btn-secondary whitespace-nowrap">{lookup.isPending ? "…" : "Look up"}</button>
            </div>
            {lookupMsg && <p className="text-xs text-slate-500 mt-1.5">{lookupMsg}</p>}
          </div>

          {/* 2 — read the sheet */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">Read from the SDS document</div>
                <div className="text-xs text-slate-500">Upload the PDF or a clear photo. Claude fills the fields from the sheet only.</div>
              </div>
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={reading} className="btn-secondary whitespace-nowrap">{reading ? "Reading…" : "Upload SDS"}</button>
            </div>
            {draft.sdsPdfUrl && <a href={draft.sdsPdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 mt-2 inline-block">View attached document</a>}
            {warnings.length > 0 && (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <div className="font-medium">Please double-check — the sheet didn't clearly show:</div>
                <ul className="list-disc ml-4 mt-0.5">{warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
          </div>

          {/* 3 — review */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Product name *</label><input value={draft.productName} onChange={(e) => set("productName", e.target.value)} className={inp} /></div>
            <div><label className="field-label">Manufacturer / supplier</label><input value={draft.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className={inp} /></div>
            <div><label className="field-label">Product code</label><input value={draft.productCode} onChange={(e) => set("productCode", e.target.value)} className={inp} /></div>
            <div><label className="field-label">Signal word</label>
              <select value={draft.signalWord} onChange={(e) => set("signalWord", e.target.value)} className={inp}>
                <option value="">— None —</option><option value="Warning">Warning</option><option value="Danger">Danger</option>
              </select>
            </div>
            <div className="sm:col-span-2"><label className="field-label">GHS pictograms (comma-separated codes)</label><input value={draft.pictograms} onChange={(e) => set("pictograms", e.target.value)} placeholder="e.g. GHS05, GHS07" className={inp} /></div>
          </div>

          <StmtEditor label="Hazard statements (H-codes)" rows={draft.hazardStatements} onChange={(r) => set("hazardStatements", r)} codePlaceholder="H315" textPlaceholder="Causes skin irritation" />
          <IngredientEditor rows={draft.ingredients} onChange={(r) => set("ingredients", r)} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="field-label">Issue date</label><input type="date" value={draft.issueDate} onChange={(e) => set("issueDate", e.target.value)} className={inp} /></div>
            <div><label className="field-label">Revision date</label><input type="date" value={draft.revisionDate} onChange={(e) => set("revisionDate", e.target.value)} className={inp} /></div>
            <div><label className="field-label">Review by</label><input type="date" value={draft.reviewDate} onChange={(e) => set("reviewDate", e.target.value)} className={inp} /></div>
          </div>
          <div><label className="field-label">PPE</label><input value={draft.ppe} onChange={(e) => set("ppe", e.target.value)} placeholder="e.g. Gloves, eye protection" className={inp} /></div>
          <div><label className="field-label">First aid</label><textarea value={draft.firstAid} onChange={(e) => set("firstAid", e.target.value)} rows={2} className={inp} /></div>
          <div><label className="field-label">Storage & handling</label><textarea value={draft.storageHandling} onChange={(e) => set("storageHandling", e.target.value)} rows={2} className={inp} /></div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span>I've checked these details against the actual safety data sheet.</span>
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => { setErr(null); save.mutate(); }} disabled={!draft.productName.trim() || save.isPending} className="btn-primary">
            {save.isPending ? "Saving…" : confirmed ? "Save & verify" : "Save (needs review)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StmtEditor({ label, rows, onChange, codePlaceholder, textPlaceholder }: {
  label: string; rows: Stmt[]; onChange: (r: Stmt[]) => void; codePlaceholder: string; textPlaceholder: string;
}) {
  const upd = (i: number, k: keyof Stmt, v: string) => onChange(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="flex items-center justify-between"><label className="field-label">{label}</label>
        <button onClick={() => onChange([...rows, { code: "", text: "" }])} className="text-xs text-blue-600">+ Add</button>
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && <p className="text-xs text-slate-400">None recorded.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input value={r.code} onChange={(e) => upd(i, "code", e.target.value)} placeholder={codePlaceholder} className={inp + " w-24"} />
            <input value={r.text} onChange={(e) => upd(i, "text", e.target.value)} placeholder={textPlaceholder} className={inp} />
            <button onClick={() => onChange(rows.filter((_, n) => n !== i))} className="text-slate-400 hover:text-red-600 px-1" aria-label="Remove">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function IngredientEditor({ rows, onChange }: { rows: Ingredient[]; onChange: (r: Ingredient[]) => void }) {
  const upd = (i: number, k: keyof Ingredient, v: string) => onChange(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="flex items-center justify-between"><label className="field-label">Listed components</label>
        <button onClick={() => onChange([...rows, { name: "", cas: "", percent: "" }])} className="text-xs text-blue-600">+ Add</button>
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && <p className="text-xs text-slate-400">None listed on the sheet.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input value={r.name} onChange={(e) => upd(i, "name", e.target.value)} placeholder="Component" className={inp} />
            <input value={r.cas} onChange={(e) => upd(i, "cas", e.target.value)} placeholder="CAS no." className={inp + " w-32"} />
            <input value={r.percent} onChange={(e) => upd(i, "percent", e.target.value)} placeholder="%" className={inp + " w-20"} />
            <button onClick={() => onChange(rows.filter((_, n) => n !== i))} className="text-slate-400 hover:text-red-600 px-1" aria-label="Remove">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Camera barcode scan via the native BarcodeDetector API (Chrome/Edge). Hidden
 *  where unsupported — the mobile apps carry the always-on scanner. */
function ScanButton({ onDetected }: { onDetected: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
  if (!supported) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary whitespace-nowrap" aria-label="Scan barcode with camera">Scan</button>
      {open && <ScanOverlay onClose={() => setOpen(false)} onDetected={(c) => { setOpen(false); onDetected(c); }} />}
    </>
  );
}

function ScanOverlay({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes[0]?.rawValue) { onDetected(String(codes[0].rawValue)); return; }
          } catch { /* keep scanning */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr("Couldn't open the camera. Type the barcode instead.");
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onDetected]);
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-black rounded-xl overflow-hidden max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} className="w-full aspect-[4/3] object-cover" muted playsInline />
        <div className="bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">{err ?? "Point the camera at the product barcode."}</span>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function DetailModal({ sheet, isStaff, onClose, onChanged }: {
  sheet: SdsSheet; isStaff: boolean; onClose: () => void; onChanged: () => void;
}) {
  const verify = useMutation({ mutationFn: () => api(`/sds/${sheet.id}/verify`, { method: "POST" }), onSuccess: onChanged });
  const del = useMutation({ mutationFn: () => api(`/sds/${sheet.id}`, { method: "DELETE" }), onSuccess: onChanged });
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-slate-900">{sheet.productName}</h2>
            <div className="text-xs text-slate-500">{sheet.manufacturer ?? "Unknown supplier"}{sheet.barcode ? " · " + sheet.barcode : ""}</div>
          </div>
          <span className={"px-2.5 py-1 text-xs font-semibold rounded-full shrink-0 " + signalCls(sheet.signalWord)}>{sheet.signalWord || "No signal"}</span>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-4 text-sm">
          {!sheet.verified && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Read from the document and not yet checked by a person.{sheet.extractionWarnings.length ? " Unclear: " + sheet.extractionWarnings.slice(0, 4).join("; ") + "." : ""}
            </div>
          )}
          {sheet.pictograms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{sheet.pictograms.map((p, i) => <span key={i} className="text-xs bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">{p}</span>)}</div>
          )}
          {sheet.hazardStatements.length > 0 && (
            <Field title="Hazards">{sheet.hazardStatements.map((h, i) => <div key={i}><span className="font-medium">{h.code}</span> {h.text}</div>)}</Field>
          )}
          {sheet.ingredients.length > 0 && (
            <Field title="Listed components">
              <table className="w-full text-xs"><tbody>
                {sheet.ingredients.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100"><td className="py-1 pr-2">{it.name}</td><td className="py-1 pr-2 text-slate-500">{it.cas}</td><td className="py-1 text-right text-slate-500">{it.percent}</td></tr>
                ))}
              </tbody></table>
            </Field>
          )}
          {sheet.ppe && <Field title="PPE">{sheet.ppe}</Field>}
          {sheet.firstAid && <Field title="First aid">{sheet.firstAid}</Field>}
          {sheet.storageHandling && <Field title="Storage & handling">{sheet.storageHandling}</Field>}
          <div className="text-xs text-slate-500">Issue {fmtDate(sheet.issueDate)} · Revision {fmtDate(sheet.revisionDate)}{sheet.reviewDate ? " · Review by " + fmtDate(sheet.reviewDate) : ""}</div>
          {sheet.sdsPdfUrl && <a href={sheet.sdsPdfUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex">Open the SDS document</a>}
        </div>
        {isStaff && (
          <div className="px-6 py-4 border-t border-slate-200 flex justify-between gap-2">
            <button onClick={() => { if (confirm("Delete this safety data sheet?")) del.mutate(); }} disabled={del.isPending} className="btn-ghost text-red-600">Delete</button>
            {!sheet.verified && <button onClick={() => verify.mutate()} disabled={verify.isPending} className="btn-primary">{verify.isPending ? "…" : "Mark verified"}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{title}</div>
      <div className="text-slate-700 space-y-0.5">{children}</div>
    </div>
  );
}
