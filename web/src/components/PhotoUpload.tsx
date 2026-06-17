import { useRef, useState } from "react";
import { uploadPhotoFile } from "../lib/api";

/**
 * Compact photo picker for evidence/proof. Uploads immediately to /uploads/photo
 * and calls back with the stored URL. `capture="environment"` nudges phones to
 * open the rear camera — ideal for on-site inspection/incident/completion proof.
 */
export function PhotoUpload({
  url,
  onUploaded,
  label = "Add photo",
}: {
  url?: string | null;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(false);
    try {
      onUploaded(await uploadPhotoFile(f));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      {url && <PhotoThumb url={url} />}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="text-xs text-indigo-700 hover:text-indigo-900 disabled:text-slate-400"
      >
        {busy ? "Uploading…" : url ? "Replace" : `📷 ${label}`}
      </button>
      {err && <span className="text-xs text-red-600">upload failed</span>}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
    </div>
  );
}

/** Read-only thumbnail that opens the full image in a new tab. */
export function PhotoThumb({ url, size = "h-12 w-12" }: { url: string; size?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img src={url} alt="proof" className={`${size} object-cover rounded border border-slate-300`} />
    </a>
  );
}
