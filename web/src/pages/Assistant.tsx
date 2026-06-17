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
      const r = await api<{ answer: string }>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      setMessages((m) => [...m, { role: "assistant", text: r.answer }]);
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
      </div>

      {!aiQ.isLoading && !configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-4">
          The assistant isn't switched on yet. Add an <code>ANTHROPIC_API_KEY</code> in Render to enable it.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-sm">
            <p className="mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={!configured || busy}
                  className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
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
          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 text-sm disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={!configured || busy || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 rounded text-white text-sm font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}
