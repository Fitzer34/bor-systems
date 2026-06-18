import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * AI Assistant — ask plain-English questions about the org's own data
 * (jobs, assets, incidents, counts). Answers come from /ai/ask, which lets
 * Claude query the live database via tools. Single-turn for now: each question
 * is answered fresh from the data (no conversation memory yet).
 */

type Msg = { role: "user" | "assistant"; text: string };
type Usage = { plan: string; used: number; included: number | null; remaining: number | null; overIncluded: boolean };

const planLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

const SUGGESTIONS = [
  "What needs attention right now?",
  "How many jobs are open?",
  "Any critical incidents?",
  "Show me in-progress jobs",
];

export function Assistant() {
  const aiQ = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api<{ configured: boolean }>("/ai/status"),
    staleTime: 5 * 60_000,
  });
  const configured = !!aiQ.data?.configured;

  const usageQ = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api<Usage>("/ai/usage"),
    enabled: configured,
    staleTime: 60_000,
  });
  // /ai/ask returns fresh usage after each question; prefer that over the query.
  const [usageOverride, setUsageOverride] = useState<Usage | null>(null);
  const usage = usageOverride ?? usageQ.data ?? null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api<{ answer: string; usage?: Usage }>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      setMessages((m) => [...m, { role: "assistant", text: r.answer }]);
      if (r.usage) setUsageOverride(r.usage);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry — I couldn't answer that just now. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Assistant</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ask anything about your jobs, assets, and incidents — answered from your live data.
        </p>
        {configured && usage && (
          <p className="text-xs text-slate-400 mt-1">
            {usage.included == null
              ? `Unlimited AI questions · ${planLabel(usage.plan)} plan`
              : `${usage.used} of ${usage.included} AI questions used this month · ${planLabel(usage.plan)} plan`}
          </p>
        )}
      </div>

      {!aiQ.isLoading && !configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-4">
          The assistant isn't switched on yet. Add an <code>ANTHROPIC_API_KEY</code> in Render to enable it.
        </div>
      )}

      {configured && usage?.overIncluded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 mb-4">
          You've used all {usage.included} AI Assistant questions in your {planLabel(usage.plan)} plan this month. It still works — upgrade for a higher monthly allowance.
        </div>
      )}

      <div className="card space-y-3 h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-sm">
            <p className="mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={!configured || busy}
                  className="btn-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={
                  "inline-block rounded-lg px-3 py-2 text-sm whitespace-pre-wrap text-left " +
                  (m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800")
                }
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {busy && <div className="text-slate-400 text-sm">Thinking…</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!configured || busy}
          placeholder="Ask about your sites…"
          className="input flex-1 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={!configured || busy || !input.trim()}
          className="btn-primary"
        >
          Send
        </button>
      </form>
    </div>
  );
}
