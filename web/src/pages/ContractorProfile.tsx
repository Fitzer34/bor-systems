import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

/**
 * Public, no-login page a contractor opens from their claim-invite email
 * (app.hazardlink.ie/contractor/:token). They keep their company profile up to
 * date, opt in to the public HazardLink directory, and manage a reusable
 * document vault (insurance, SafePass, RAMS...) that every client sees the
 * current version of. Mobile-first, since the link is opened from email.
 */

interface ContractorDoc {
  id: string;
  type: string;
  name: string;
  url: string;
  expiresOn: string | null;
  uploadedAt: string;
}

interface ContractorInfo {
  contractor: {
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    county: string | null;
    services: string | null;
    bio: string | null;
    publicListed: boolean;
    claimedAt: string | null;
  };
  invitedBy: string | null;
  documents: ContractorDoc[];
}

const DOC_TYPES: Array<[value: string, label: string]> = [
  ["insurance", "Insurance"],
  ["safe_pass", "SafePass"],
  ["manual_handling", "Manual handling"],
  ["rams", "RAMS"],
  ["method_statement", "Method statement"],
  ["cert", "Certificate"],
  ["other", "Other"],
];

const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES);

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

/** Client-side expiry status: valid / expires soon (≤60d) / expired / no expiry. */
function docStatus(expiresOn: string | null): { label: string; cls: string } {
  if (!expiresOn) return { label: "No expiry", cls: "bg-slate-100 text-slate-600" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${expiresOn}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return { label: "No expiry", cls: "bg-slate-100 text-slate-600" };
  const days = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "EXPIRED", cls: "bg-red-100 text-red-700" };
  if (days === 0) return { label: "Expires today", cls: "bg-amber-100 text-amber-800" };
  if (days <= 60) return { label: `Expires in ${days}d`, cls: "bg-amber-100 text-amber-800" };
  return { label: "Valid", cls: "bg-emerald-100 text-emerald-700" };
}

export function ContractorProfile() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ContractorInfo | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Profile form
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [county, setCounty] = useState("");
  const [services, setServices] = useState("");
  const [bio, setBio] = useState("");
  const [publicListed, setPublicListed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Document vault
  const [docs, setDocs] = useState<ContractorDoc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [docType, setDocType] = useState("insurance");
  const [docName, setDocName] = useState("");
  const [docExpiry, setDocExpiry] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/public/contractor/${token}`))
      .then((r) => { if (!r.ok) throw new Error("nf"); return r.json(); })
      .then((d: ContractorInfo) => {
        if (!alive) return;
        setInfo(d);
        setContactName(d.contractor.contactName ?? "");
        setPhone(d.contractor.phone ?? "");
        setCounty(d.contractor.county ?? "");
        setServices(d.contractor.services ?? "");
        setBio(d.contractor.bio ?? "");
        setPublicListed(!!d.contractor.publicListed);
        setDocs(d.documents ?? []);
      })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [token]);

  async function saveProfile() {
    setSaving(true);
    setSaved(false);
    setSaveErr(null);
    try {
      const r = await fetch(apiUrl(`/public/contractor/${token}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName: contactName.trim(),
          phone: phone.trim(),
          county: county.trim(),
          services: services.trim(),
          bio: bio.trim(),
          publicListed,
        }),
      });
      if (!r.ok) throw new Error("failed");
      setSaved(true);
    } catch {
      setSaveErr("Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadDoc() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      // Text fields go before the file part so the backend sees them all.
      fd.append("type", docType);
      if (docName.trim()) fd.append("name", docName.trim());
      if (docExpiry) fd.append("expiresOn", docExpiry);
      fd.append("file", file);
      const r = await fetch(apiUrl(`/public/contractor/${token}/document`), {
        method: "POST",
        body: fd,
      });
      const body: { document?: ContractorDoc; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok || !body.document) throw new Error(body.error || "failed");
      const uploaded = body.document;
      setDocs((ds) => [uploaded, ...ds]);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setDocName("");
      setDocExpiry("");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setUploadErr(
        code === "must_be_pdf_or_image" ? "That file type is not supported. Upload a PDF or a photo."
        : code === "too_large" ? "That file is too large. Try a smaller PDF or photo."
        : code === "too_many_documents" ? "Your vault is full (25 documents). Delete an old one first."
        : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(doc: ContractorDoc) {
    if (!window.confirm(`Delete "${doc.name}"? Clients will no longer see it.`)) return;
    try {
      const r = await fetch(apiUrl(`/public/contractor/${token}/document/${doc.id}`), { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
      setDocs((ds) => ds.filter((d) => d.id !== doc.id));
    } catch {
      window.alert("Could not delete that document. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {loadError ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Link not found</h1>
            <p className="text-slate-600 mt-2">This profile link is invalid or no longer active. Ask the company that invited you to send a fresh link.</p>
          </div>
        ) : !info ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-center py-10">Loading…</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Header ── */}
            <div className="bg-slate-900 text-white rounded-2xl shadow-sm px-6 py-5">
              <div className="text-xs uppercase tracking-wider text-slate-400">Your contractor profile</div>
              <div className="text-lg font-semibold mt-0.5">{info.contractor.name}</div>
              {info.invitedBy && (
                <div className="text-sm text-slate-300 mt-0.5">Invited by {info.invitedBy}</div>
              )}
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                Upload your insurance and certs once and every client you work with through
                HazardLink sees the current version. No login needed, this link is yours.
              </p>
            </div>

            {/* ── Profile form ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Company details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Contact name</label>
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120}
                    placeholder="e.g. Mary O'Sullivan" className="input" />
                </div>
                <div>
                  <label className="field-label">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel"
                    placeholder="e.g. 087 123 4567" className="input" />
                </div>
                <div>
                  <label className="field-label">County</label>
                  <input value={county} onChange={(e) => setCounty(e.target.value)} maxLength={60}
                    placeholder="e.g. Dublin" className="input" />
                </div>
                <div>
                  <label className="field-label">Services</label>
                  <input value={services} onChange={(e) => setServices(e.target.value)} maxLength={300}
                    placeholder="e.g. Plumbing, drainage, HVAC" className="input" />
                </div>
              </div>
              <div>
                <label className="field-label">About your company</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={2000}
                  placeholder="A few lines on what you do, the areas you cover and what you're known for."
                  className="input resize-none" />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 cursor-pointer">
                <input type="checkbox" checked={publicListed} onChange={(e) => setPublicListed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">List my company in the public HazardLink contractor directory</span>
                  <br />
                  <span className="text-slate-500">Facilities teams browsing the directory can find you and invite you to tender for work.</span>
                </span>
              </label>
              {saveErr && <p className="text-sm text-red-600">{saveErr}</p>}
              {saved && <p className="text-sm text-emerald-700">Profile saved. Your clients now see the updated details.</p>}
              <button onClick={saveProfile} disabled={saving} className="btn-primary w-full py-2.5">
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>

            {/* ── Document vault ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Document vault</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Insurance, SafePass, RAMS and certs. Documents with an expiry date get flagged before they lapse.
                </p>
              </div>

              {docs.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3">
                  Nothing on file yet. Upload your first document below.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {docs.map((d) => {
                    const st = docStatus(d.expiresOn);
                    return (
                      <li key={d.id} className="px-3 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                          <div className="text-xs text-slate-500">
                            {DOC_TYPE_LABELS[d.type] ?? "Other"}
                            {d.expiresOn ? ` · expires ${formatDate(d.expiresOn)}` : ""}
                            {d.uploadedAt ? ` · uploaded ${formatDate(d.uploadedAt)}` : ""}
                          </div>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                          {st.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <a href={d.url} target="_blank" rel="noreferrer"
                            className="text-sm font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">
                            View
                          </a>
                          <button onClick={() => deleteDoc(d)}
                            className="text-sm font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* ── Upload form ── */}
              <div className="border border-dashed border-slate-300 rounded-xl px-4 py-4 space-y-3 bg-slate-50">
                <div className="text-sm font-semibold text-slate-900">Add a document</div>
                <div>
                  <label className="field-label">File (PDF or photo)</label>
                  <input ref={fileInput} type="file" accept="application/pdf,image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Type</label>
                    <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input">
                      {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Expiry date (optional)</label>
                    <input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} className="input" />
                  </div>
                </div>
                <div>
                  <label className="field-label">Name (optional)</label>
                  <input value={docName} onChange={(e) => setDocName(e.target.value)} maxLength={160}
                    placeholder="e.g. Public liability policy 2026" className="input" />
                </div>
                {uploadErr && <p className="text-sm text-red-600">{uploadErr}</p>}
                <button onClick={uploadDoc} disabled={uploading || !file} className="btn-primary w-full py-2.5">
                  {uploading ? "Uploading…" : "Upload document"}
                </button>
              </div>
            </div>
          </div>
        )}
        <p className="text-center text-xs text-slate-400 mt-4">Powered by HazardLink</p>
      </div>
    </div>
  );
}
