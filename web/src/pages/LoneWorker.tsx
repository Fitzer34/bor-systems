import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTicker } from "../lib/ticker";

/**
 * Lone-worker safety — an overall capability for any worker (cleaner / tech /
 * guard). Start a welfare-check-in session, tap "I'm OK" before the timer runs
 * out (a missed check-in auto-escalates to the hub), or hit Panic. Admins +
 * supervisors get a live monitoring view of everyone's sessions.
 */

interface Session {
  id: string;
  status: "active" | "ended" | "alarm";
  intervalMinutes: number;
  note: string | null;
  startedAt: string;
  lastCheckInAt: string | null;
  nextCheckInDueAt: string | null;
  alarmReason: string | null;
  alarmAt: string | null;
}
interface MonSession extends Session {
  userId: string;
  userName: string | null;
}

const INTERVALS = [15, 30, 60, 120];

function mmss(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LoneWorker() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "supervisor";
  useTicker(1000);

  const mine = useQuery({ queryKey: ["lone-worker-active"], queryFn: () => api<{ session: Session | null }>("/lone-worker/active"), refetchInterval: 15_000 });
  const monitor = useQuery({ queryKey: ["lone-worker-sessions"], queryFn: () => api<{ sessions: MonSession[] }>("/lone-worker/sessions"), enabled: isStaff, refetchInterval: 15_000 });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["lone-worker-active"] }); qc.invalidateQueries({ queryKey: ["lone-worker-sessions"] }); };

  const [interval, setIntervalMin] = useState(30);
  const [note, setNote] = useState("");
  const [confirmPanic, setConfirmPanic] = useState(false);

  const start = useMutation({ mutationFn: () => api("/lone-worker/start", { method: "POST", body: JSON.stringify({ intervalMinutes: interval, note: note.trim() || undefined }) }), onSuccess: invalidate });
  const checkIn = useMutation({ mutationFn: () => api("/lone-worker/check-in", { method: "POST" }), onSuccess: invalidate });
  const end = useMutation({ mutationFn: () => api("/lone-worker/end", { method: "POST" }), onSuccess: () => { setConfirmPanic(false); invalidate(); } });
  const panic = useMutation({ mutationFn: () => api("/lone-worker/panic", { method: "POST" }), onSuccess: () => { setConfirmPanic(false); invalidate(); } });

  const s = mine.data?.session ?? null;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Lone worker safety</h1>
      <p className="text-sm text-slate-500 mt-1">Working alone? Start a check-in session. If you miss a check-in, or hit panic, your supervisors are alerted.</p>

      {/* ─── My session ─── */}
      <div className="mt-6 card p-5">
        {!s || s.status === "ended" ? (
          <>
            <div className="font-semibold text-slate-900 mb-3">Start a session</div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="field-label">Check in every</label>
                <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} className="input">
                  {INTERVALS.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="field-label">What / where (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Roof inspection, Block B" className="input" />
              </div>
              <button onClick={() => start.mutate()} disabled={start.isPending} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 rounded-lg text-white font-medium transition active:scale-[0.98]">
                {start.isPending ? "Starting…" : "Start session"}
              </button>
            </div>
          </>
        ) : s.status === "alarm" ? (
          <div className="text-center py-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-red-600" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="text-lg font-semibold text-red-700">Alarm raised — {s.alarmReason === "panic" ? "PANIC / SOS" : "missed check-in"}</div>
            <p className="text-sm text-slate-600 mt-1">Your supervisors have been alerted. Stand down once you're safe.</p>
            <div className="flex justify-center gap-2 mt-4">
              <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending} className="btn-primary">I'm OK — resume</button>
              <button onClick={() => end.mutate()} disabled={end.isPending} className="btn-secondary">End session</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-medium text-slate-900">Session active{s.note ? ` · ${s.note}` : ""}</div>
                <div className="text-sm text-slate-500 mt-0.5">Checking in every {s.intervalMinutes} min</div>
              </div>
              {(() => {
                const ms = s.nextCheckInDueAt ? Date.parse(s.nextCheckInDueAt) - Date.now() : 0;
                const overdue = ms <= 0;
                return (
                  <div className={"text-right " + (overdue ? "text-red-700" : ms < 120_000 ? "text-amber-700" : "text-slate-700")}>
                    <div className="text-xs uppercase tracking-wide">{overdue ? "Check in now" : "Next check-in"}</div>
                    <div className="text-2xl font-semibold tabular-nums">{overdue ? "due" : mmss(ms)}</div>
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 rounded-lg text-white font-semibold transition active:scale-[0.98]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                I'm OK
              </button>
              <button onClick={() => end.mutate()} disabled={end.isPending} className="btn-secondary">End session</button>
            </div>
          </>
        )}
      </div>

      {/* ─── Panic (always available) ─── */}
      <div className="mt-4">
        {confirmPanic ? (
          <div className="flex items-center gap-2">
            <button onClick={() => panic.mutate()} disabled={panic.isPending} className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition active:scale-[0.98]">{panic.isPending ? "Sending…" : "CONFIRM — send SOS"}</button>
            <button onClick={() => setConfirmPanic(false)} className="btn-ghost">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmPanic(true)} className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition active:scale-[0.98]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            Panic / SOS
          </button>
        )}
        <p className="text-xs text-slate-400 mt-1.5">Alerts your supervisors immediately. (Works while the app is open.)</p>
      </div>

      {/* ─── Monitoring (staff) ─── */}
      {isStaff && (
        <>
          <h2 className="section-title mt-10">Live sessions</h2>
          {(monitor.data?.sessions ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <div className="text-slate-900 font-medium">No active sessions</div>
              <div className="text-slate-500 text-sm mt-1">No one is currently in a check-in session.</div>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden divide-y divide-slate-100">
              {(monitor.data?.sessions ?? []).map((m) => {
                const ms = m.nextCheckInDueAt ? Date.parse(m.nextCheckInDueAt) - Date.now() : 0;
                const alarm = m.status === "alarm";
                const overdue = !alarm && ms <= 0;
                const pillCls = alarm ? "pill-alert" : overdue ? "pill-alert" : ms < 120_000 ? "pill-offline" : "pill-online";
                const label = alarm ? (m.alarmReason === "panic" ? "Panic" : "Missed") : overdue ? "Overdue" : "OK";
                return (
                  <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 text-sm flex-wrap">
                    <span className={pillCls}>
                      {(alarm || overdue) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      )}
                      {label}
                    </span>
                    <span className="font-medium text-slate-900">{m.userName ?? "Worker"}</span>
                    {m.note && <span className="text-slate-500">· {m.note}</span>}
                    <span className="text-slate-400 ml-auto">
                      {alarm ? "alarm" : overdue ? "check-in due" : `next in ${mmss(ms)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
