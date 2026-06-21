import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PhotoUpload, PhotoThumb } from "../components/PhotoUpload";

/**
 * Maintenance — the Phase-1 core loop, one screen:
 *   Jobs board → log a job → tender to contractors → enter quotes →
 *   award (preferred vs cheapest, reason recorded). Plus a Contractors register.
 * Held to the "one clear action" simplicity bar. See docs/MAINTENANCE_PLATFORM_SPEC.md.
 */

interface Trade { id: string; name: string; groupName: string; statutory: boolean }
interface Contractor {
  id: string; name: string; contactName: string | null; email: string | null;
  phone: string | null; region: string | null; isPreferred: boolean; tier: string; active: boolean;
}
interface Job {
  id: string; title: string; description: string | null; status: string; priority: string;
  tradeId: string | null; awardReason: string | null; createdAt: string;
  scheduledStartAt: string | null; completedAt: string | null; completionNote: string | null; completionPhotoUrl: string | null;
}
interface Quote {
  id: string; contractorId: string; contractorName: string; isPreferred: boolean; status: string;
  amountCents: number | null; upfrontCents: number | null; upfrontPct: number | null;
  proposedStartDate: string | null; notes: string | null; submittedAt: string | null;
  token: string | null; contractorEmail: string | null;
}
interface JobEvent { id: string; type: string; detail: string | null; createdAt: string }

const euro = (cents: number | null | undefined) =>
  cents == null ? "—" : `€${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const STATUS_STYLE: Record<string, string> = {
  logged: "pill-muted",
  tendering: "pill-offline",
  awarded: "pill-info",
  scheduled: "pill-info",
  in_progress: "pill-info",
  completed: "pill-online",
  cancelled: "pill-muted",
};

export function Maintenance() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  const qc = useQueryClient();
  const [tab, setTab] = useState<"jobs" | "contractors">("jobs");
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [addingContractor, setAddingContractor] = useState(false);

  const jobsQ = useQuery({ queryKey: ["mx-jobs"], queryFn: () => api<{ jobs: Job[] }>("/jobs"), refetchInterval: 10_000 });
  const contractorsQ = useQuery({ queryKey: ["mx-contractors"], queryFn: () => api<{ contractors: Contractor[] }>("/contractors") });
  const tradesQ = useQuery({ queryKey: ["mx-trades"], queryFn: () => api<{ trades: Trade[] }>("/trades") });

  const trades = tradesQ.data?.trades ?? [];
  const tradeName = (id: string | null) => trades.find((t) => t.id === id)?.name ?? "";

  if (!isStaff) return <div className="p-8 text-slate-500">Maintenance is for admins and supervisors.</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        {tab === "jobs" ? (
          <button onClick={() => setLogging(true)} className="btn-primary">
            <PlusIcon /> Log a job
          </button>
        ) : (
          <button onClick={() => setAddingContractor(true)} className="btn-primary">
            <PlusIcon /> Add contractor
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 text-sm">
        {(["jobs", "contractors"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={"px-3 py-1.5 rounded-lg font-medium transition " + (tab === t ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")}
          >
            {t === "jobs" ? "Jobs" : "Contractors"}
          </button>
        ))}
      </div>

      {tab === "jobs" && (
        jobsQ.isLoading ? (
          <div className="text-slate-500">Loading jobs…</div>
        ) : (jobsQ.data?.jobs.length ?? 0) === 0 ? (
          <Empty>No jobs yet. Tap <em>Log a job</em> to start one.</Empty>
        ) : (
          <div className="space-y-2">
            {jobsQ.data!.jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setOpenJobId(j.id)}
                className="card card-hover w-full text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900 truncate">{j.title}</h3>
                      {j.priority === "emergency" && <Pill className="pill-alert">Emergency</Pill>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {tradeName(j.tradeId) || "Unclassified"} · {relTime(j.createdAt)}
                    </p>
                  </div>
                  <Pill className={STATUS_STYLE[j.status] ?? "pill-muted"}>
                    {j.status.replace("_", " ")}
                  </Pill>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {tab === "contractors" && (
        contractorsQ.isLoading ? (
          <div className="text-slate-500">Loading contractors…</div>
        ) : (contractorsQ.data?.contractors.length ?? 0) === 0 ? (
          <Empty>No contractors yet. Tap <em>Add contractor</em> to build your list.</Empty>
        ) : (
          <div className="space-y-2">
            {contractorsQ.data!.contractors.map((c) => (
              <div key={c.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-900 truncate">{c.name}</h3>
                    {c.isPreferred && <Pill className="pill-online">★ Preferred</Pill>}
                    {c.tier === "blocked" && <Pill className="pill-alert">Blocked</Pill>}
                  </div>
                  <p className="text-xs text-slate-500">{[c.email, c.phone, c.region].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <button
                  onClick={() =>
                    api(`/contractors/${c.id}`, { method: "PATCH", body: JSON.stringify({ isPreferred: !c.isPreferred }) })
                      .then(() => qc.invalidateQueries({ queryKey: ["mx-contractors"] }))
                  }
                  className="btn-ghost whitespace-nowrap"
                >
                  {c.isPreferred ? "Unprefer" : "Make preferred"}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {logging && (
        <LogJobDialog
          trades={trades}
          onClose={() => setLogging(false)}
          onLogged={() => { qc.invalidateQueries({ queryKey: ["mx-jobs"] }); setLogging(false); }}
        />
      )}
      {addingContractor && (
        <AddContractorDialog
          trades={trades}
          onClose={() => setAddingContractor(false)}
          onAdded={() => { qc.invalidateQueries({ queryKey: ["mx-contractors"] }); setAddingContractor(false); }}
        />
      )}
      {openJobId && (
        <JobModal
          jobId={openJobId}
          contractors={(contractorsQ.data?.contractors ?? []).filter((c) => c.active && c.tier !== "blocked")}
          tradeName={tradeName}
          onClose={() => setOpenJobId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["mx-jobs"] })}
        />
      )}
    </div>
  );
}

// ─── Job detail + the tender/quote/award loop ────────────────────────────────

function JobModal({
  jobId, contractors, tradeName, onClose, onChanged,
}: {
  jobId: string;
  contractors: Contractor[];
  tradeName: (id: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detailQ = useQuery({ queryKey: ["mx-job", jobId], queryFn: () => api<{ job: Job; quotes: Quote[]; events: JobEvent[] }>(`/jobs/${jobId}`) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scheduleAt, setScheduleAt] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [completePhoto, setCompletePhoto] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["mx-job", jobId] }); onChanged(); };
  const act = (path: string, body?: unknown) =>
    api(`/jobs/${jobId}/${path}`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }).then(refresh);

  const d = detailQ.data;
  const cheapest = d
    ? d.quotes.filter((q) => q.status === "submitted" && q.amountCents != null)
        .reduce<Quote | null>((lo, q) => (lo == null || (q.amountCents! < lo.amountCents!) ? q : lo), null)
    : null;

  return (
    <Modal onClose={onClose} title={d?.job.title ?? "Job"}>
      {!d ? (
        <div className="px-6 py-8 text-slate-500">Loading…</div>
      ) : (
        <div className="px-6 py-5 space-y-5 max-h-[72vh] overflow-y-auto">
          <div className="flex items-center gap-2 text-sm">
            <Pill className={STATUS_STYLE[d.job.status] ?? "pill-muted"}>{d.job.status.replace("_", " ")}</Pill>
            <span className="text-slate-500">{tradeName(d.job.tradeId) || "Unclassified"}</span>
            {d.job.priority === "emergency" && <Pill className="pill-alert">Emergency</Pill>}
          </div>
          {d.job.description && <p className="text-sm text-slate-600">{d.job.description}</p>}

          {/* Tender — pick contractors */}
          {(d.job.status === "logged" || d.job.status === "tendering") && (
            <Section title="Send to tender">
              <p className="text-xs text-slate-500 mb-2">Pick the contractors to invite. Preferred ones are starred.</p>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {contractors.map((c) => {
                  const already = d.quotes.some((q) => q.contractorId === c.id);
                  return (
                    <label key={c.id} className={"flex items-center gap-2 text-sm px-2 py-1 rounded " + (already ? "opacity-40" : "hover:bg-slate-100 cursor-pointer")}>
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={picked.has(c.id)}
                        onChange={(e) => setPicked((p) => { const n = new Set(p); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })}
                      />
                      <span className="text-slate-800">{c.name}</span>
                      {c.isPreferred && <span className="text-emerald-700 text-xs">★</span>}
                      {already && <span className="text-xs text-slate-500">(invited)</span>}
                    </label>
                  );
                })}
                {contractors.length === 0 && <p className="text-sm text-slate-500">Add contractors first.</p>}
              </div>
              <button
                disabled={picked.size === 0}
                onClick={() =>
                  api(`/jobs/${jobId}/tender`, { method: "POST", body: JSON.stringify({ contractorIds: [...picked] }) })
                    .then(() => { setPicked(new Set()); refresh(); })
                }
                className="btn-primary mt-2"
              >
                Send to {picked.size || ""} {picked.size === 1 ? "contractor" : "contractors"}
              </button>
            </Section>
          )}

          {/* Quotes + award compare */}
          {d.quotes.length > 0 && (
            <Section title="Quotes">
              <div className="space-y-2">
                {d.quotes.map((q) => (
                  <QuoteRow
                    key={q.id}
                    jobId={jobId}
                    quote={q}
                    isCheapest={cheapest?.id === q.id}
                    jobStatus={d.job.status}
                    onSubmitted={refresh}
                    onAwarded={refresh}
                    cheapestCents={cheapest?.amountCents ?? null}
                  />
                ))}
              </div>
              <QuoteRanker jobId={jobId} quotes={d.quotes} />
            </Section>
          )}

          {/* Work-order lifecycle */}
          {d.job.status !== "cancelled" && (
            <Section title="Work order">
              {["logged", "scoped", "tendering", "awarded"].includes(d.job.status) && (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="field-label">Schedule start</label>
                    <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="input w-auto" />
                  </div>
                  <button disabled={!scheduleAt} onClick={() => act("schedule", { scheduledStartAt: new Date(scheduleAt).toISOString() })} className="btn-primary">Schedule</button>
                </div>
              )}
              {d.job.status === "scheduled" && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-slate-700 inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Scheduled for <b>{d.job.scheduledStartAt ? fmtDateTime(d.job.scheduledStartAt) : "—"}</b>
                  </span>
                  <button onClick={() => act("start")} className="btn-primary">Mark started</button>
                </div>
              )}
              {d.job.status === "in_progress" && (
                <div className="space-y-2">
                  <input value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} placeholder="Completion note (optional)" className="input" />
                  <PhotoUpload url={completePhoto || null} onUploaded={setCompletePhoto} label="completion photo" />
                  <button onClick={() => act("complete", { completionNote: completeNote.trim() || undefined, completionPhotoUrl: completePhoto || undefined })} className="btn-primary">Mark complete</button>
                </div>
              )}
              {d.job.status === "completed" && (
                <div className="space-y-2">
                  <p className="text-sm text-emerald-700 inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Completed{d.job.completedAt ? ` · ${fmtDateTime(d.job.completedAt)}` : ""}{d.job.completionNote ? ` — ${d.job.completionNote}` : ""}
                  </p>
                  {d.job.completionPhotoUrl && <PhotoThumb url={d.job.completionPhotoUrl} />}
                </div>
              )}
              {d.job.status !== "completed" && (
                <div className="mt-3">
                  {confirmingCancel ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-red-600">Cancel this job?</span>
                      <button onClick={() => act("cancel")} className="btn-danger">Yes, cancel</button>
                      <button onClick={() => setConfirmingCancel(false)} className="btn-ghost">No</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmingCancel(true)} className="btn-danger">Cancel job</button>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Timeline */}
          <Section title="Timeline">
            <div className="space-y-1.5">
              {d.events.map((e) => (
                <div key={e.id} className="flex gap-3 text-xs">
                  <span className="text-slate-500 whitespace-nowrap w-28 shrink-0">{relTime(e.createdAt)}</span>
                  <span className="text-slate-600"><b className="text-slate-800">{e.type}</b>{e.detail ? ` — ${e.detail}` : ""}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </Modal>
  );
}

function QuoteRow({
  jobId, quote, isCheapest, jobStatus, cheapestCents, onSubmitted, onAwarded,
}: {
  jobId: string; quote: Quote; isCheapest: boolean; jobStatus: string; cheapestCents: number | null;
  onSubmitted: () => void; onAwarded: () => void;
}) {
  const [entering, setEntering] = useState(false);
  const [amount, setAmount] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);

  const submitted = quote.status === "submitted" || quote.status === "awarded";
  const overCheapest = quote.amountCents != null && cheapestCents != null ? quote.amountCents - cheapestCents : 0;

  const award = () => {
    if (!isCheapest && !reason.trim()) { setShowReason(true); return; }
    api(`/jobs/${jobId}/award`, { method: "POST", body: JSON.stringify({ quoteId: quote.id, reason: reason.trim() || undefined }) }).then(onAwarded);
  };

  return (
    <div className={"card " + (quote.status === "awarded" ? "border-emerald-300 bg-emerald-50" : "")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-800 text-sm truncate">{quote.contractorName}</span>
          {quote.isPreferred && <span className="text-emerald-700 text-xs">★ preferred</span>}
          {isCheapest && submitted && <Pill className="pill-online">cheapest</Pill>}
          {quote.status === "awarded" && <Pill className="pill-online">awarded</Pill>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-slate-900 font-semibold">{euro(quote.amountCents)}</div>
          {submitted && overCheapest > 0 && <div className="text-xs text-amber-700">+{euro(overCheapest)} vs cheapest</div>}
        </div>
      </div>

      {/* Pending — emailed a magic link; copy/resend it, or enter the quote manually. */}
      {quote.status === "pending" && (
        <div className="mt-1.5 space-y-1.5">
          {quote.token && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 inline-flex items-center gap-1.5">
                {quote.contractorEmail ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
                    </svg>
                    Emailed — awaiting their quote
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    No email on file
                  </>
                )}
              </span>
              <button
                onClick={() => { const u = `${window.location.origin}/quote/${quote.token}`; navigator.clipboard?.writeText(u).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                className="text-blue-700 hover:underline"
              >{copied ? "Copied!" : "Copy link"}</button>
            </div>
          )}
          {entering ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="field-label">Quote (€)</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
                  className="input" placeholder="1450" />
              </div>
              <button
                disabled={!amount}
                onClick={() =>
                  api(`/quotes/${quote.id}`, { method: "PATCH", body: JSON.stringify({ amountCents: Math.round(Number(amount) * 100) }) })
                    .then(() => { setEntering(false); onSubmitted(); })
                }
                className="btn-primary">Save</button>
            </div>
          ) : (
            <button onClick={() => setEntering(true)} className="btn-ghost">+ Enter it manually</button>
          )}
        </div>
      )}

      {/* Award (when a quote is submitted and the job isn't awarded yet) */}
      {quote.status === "submitted" && jobStatus !== "awarded" && (
        <div className="mt-2 space-y-2">
          {showReason && !isCheapest && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
              className="input"
              placeholder="Not the cheapest — why this one? (preferred, faster, reliable…)" />
          )}
          <button onClick={award} disabled={showReason && !isCheapest && !reason.trim()}
            className="btn-primary">
            {showReason && !isCheapest ? "Confirm award" : "Award this"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

// Whether Claude AI helpers are available (ANTHROPIC_API_KEY set on the server).
// Cached for the session so the "✨" buttons only show when they'll work.
function useAiConfigured(): boolean {
  const { data } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api<{ configured: boolean }>("/ai/status"),
    staleTime: 5 * 60_000,
  });
  return !!data?.configured;
}

// AI value-assessment of the submitted quotes on a job. Self-contained: renders
// nothing unless AI is configured and there are ≥2 quotes to compare.
function QuoteRanker({ jobId, quotes }: { jobId: string; quotes: Quote[] }) {
  const aiConfigured = useAiConfigured();
  const rankable = quotes.filter((q) => q.status === "submitted" || q.status === "awarded").length;
  type Ranking = { recommendedQuoteId: string; summary: string; flags: string[] };
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rank = useMutation({
    mutationFn: () => api<{ ranking: Ranking }>(`/jobs/${jobId}/rank-quotes`, { method: "POST" }),
    onSuccess: (r) => setRanking(r.ranking),
    onError: () => setErr("Couldn't rank the quotes — try again."),
  });
  if (!aiConfigured || rankable < 2) return null;
  const recName = ranking ? quotes.find((q) => q.id === ranking.recommendedQuoteId)?.contractorName : null;
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      {!ranking ? (
        <button onClick={() => { setErr(null); rank.mutate(); }} disabled={rank.isPending}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900 font-medium disabled:text-slate-400">
          {rank.isPending ? "Analysing quotes…" : <><SparkleIcon /> Rank these quotes with AI</>}
        </button>
      ) : (
        <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-sm">
          <div className="font-medium text-indigo-900 mb-1 inline-flex items-center gap-1.5"><SparkleIcon /> AI assessment</div>
          {recName && <div className="text-slate-800 mb-1">Best value: <b>{recName}</b></div>}
          <p className="text-slate-700 whitespace-pre-wrap">{ranking.summary}</p>
          {ranking.flags.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {ranking.flags.map((f, i) => (
                <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-400 mt-2">AI guidance — you make the final call.</p>
        </div>
      )}
      {err && <p className="text-xs text-red-700 mt-1">{err}</p>}
    </div>
  );
}

function LogJobDialog({ trades, onClose, onLogged }: { trades: Trade[]; onClose: () => void; onLogged: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tradeId, setTradeId] = useState("");
  const [priority, setPriority] = useState("routine");
  const aiConfigured = useAiConfigured();
  const [aiErr, setAiErr] = useState<string | null>(null);
  const draft = useMutation({
    mutationFn: () =>
      api<{ scope: string }>("/ai/scope", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          trade: trades.find((t) => t.id === tradeId)?.name,
        }),
      }),
    onSuccess: (r) => setDescription(r.scope),
    onError: () => setAiErr("Couldn't draft the scope — try again."),
  });
  const save = useMutation({
    mutationFn: () =>
      api("/jobs", { method: "POST", body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, tradeId: tradeId || undefined, priority }) }),
    onSuccess: onLogged,
  });
  return (
    <Modal onClose={onClose} title="Log a job">
      <div className="px-6 py-5 space-y-4">
        <Field label="What needs doing?">
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className={inputCls} placeholder="e.g. AC not cooling in the server room" />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="field-label mb-0">Detail / scope of works (optional)</label>
            {aiConfigured && (
              <button
                type="button"
                disabled={!title.trim() || draft.isPending}
                onClick={() => { setAiErr(null); draft.mutate(); }}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900 disabled:text-slate-400 font-medium"
              >
                {draft.isPending ? "Drafting…" : <><SparkleIcon /> Draft scope with AI</>}
              </button>
            )}
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={inputCls + " resize-none"}
            placeholder="Or write it yourself — title plus any notes is enough for the AI draft." />
          {aiErr && <p className="text-xs text-red-700 mt-1">{aiErr}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trade">
            <select value={tradeId} onChange={(e) => setTradeId(e.target.value)} className={inputCls}>
              <option value="">— Pick later —</option>
              {trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </Field>
        </div>
        {save.error && <p className="text-sm text-red-700">Couldn't log the job — try again.</p>}
      </div>
      <Footer onClose={onClose} onSave={() => save.mutate()} saveLabel="Log job" disabled={!title.trim() || save.isPending} />
    </Modal>
  );
}

function AddContractorDialog({ trades, onClose, onAdded }: { trades: Trade[]; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPreferred, setIsPreferred] = useState(false);
  const [tradeIds, setTradeIds] = useState<Set<string>>(new Set());
  const save = useMutation({
    mutationFn: () =>
      api("/contractors", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, isPreferred, tradeIds: [...tradeIds] }) }),
    onSuccess: onAdded,
  });
  return (
    <Modal onClose={onClose} title="Add contractor">
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <Field label="Company name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="for tenders" /></Field>
          <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Trades they cover">
          <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded p-2">
            {trades.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm hover:bg-slate-100 px-1 rounded cursor-pointer">
                <input type="checkbox" checked={tradeIds.has(t.id)}
                  onChange={(e) => setTradeIds((p) => { const n = new Set(p); e.target.checked ? n.add(t.id) : n.delete(t.id); return n; })} />
                <span className="text-slate-800">{t.name}</span>
              </label>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
          <input type="checkbox" checked={isPreferred} onChange={(e) => setIsPreferred(e.target.checked)} /> Mark as preferred
        </label>
      </div>
      <Footer onClose={onClose} onSave={() => save.mutate()} saveLabel="Add" disabled={!name.trim() || save.isPending} />
    </Modal>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

const inputCls = "input";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg border border-slate-300 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Footer({ onClose, onSave, saveLabel, disabled }: { onClose: () => void; onSave: () => void; saveLabel: string; disabled: boolean }) {
  return (
    <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
      <button onClick={onClose} className="btn-ghost">Cancel</button>
      <button onClick={onSave} disabled={disabled} className="btn-primary">{saveLabel}</button>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><h3 className="section-title">{title}</h3>{children}</div>);
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="field-label">{label}</label>{children}</div>);
}
function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={className}>{children}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 text-sm">{children}</div>;
}
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden="true">
      <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
    </svg>
  );
}
function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
