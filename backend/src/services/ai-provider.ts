import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider seam for every LLM call in HazardLink — built so the AI can run at
 * effectively zero cost and can NEVER run away with money.
 *
 * Provider is picked by AI_PROVIDER, or auto-detected from whichever key is
 * set (first match wins):
 *   anthropic — Claude via ANTHROPIC_API_KEY (paid, highest quality)
 *   groq      — GROQ_API_KEY, OpenAI-compatible endpoint. Groq's free tier
 *               covers HazardLink's short, low-volume calls; models default
 *               to Llama 3.3 70B (smart) / Llama 3.1 8B (fast).
 *   gemini    — GEMINI_API_KEY, Google's free tier (Flash).
 *   ollama    — a model running on your own machine (OLLAMA_URL), literally
 *               free; for dev or a self-hosted box.
 *   off       — every AI feature reports "not configured" and the UI shows
 *               its honest disabled state. Nothing is ever charged.
 *
 * Runaway protection, independent of provider:
 *   AI_DAILY_CALL_CAP (default 500) — max LLM calls per UTC day, process-wide.
 *   Once hit, calls throw "ai_budget_reached" and the UI explains itself.
 *   A tiny response cache (10 min) also absorbs repeated identical asks.
 */

export type AiTier = "smart" | "fast";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const ANTHROPIC_MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-4-6";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_MODEL_FAST = process.env.GROQ_MODEL_FAST || "llama-3.1-8b-instant";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const DAILY_CALL_CAP = Number(process.env.AI_DAILY_CALL_CAP || 500);

export function aiProvider(): "anthropic" | "groq" | "gemini" | "ollama" | "off" {
  const p = (process.env.AI_PROVIDER || "").toLowerCase();
  if (p === "anthropic" || p === "groq" || p === "gemini" || p === "ollama" || p === "off") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "off";
}

export function isAiAvailable(): boolean {
  const p = aiProvider();
  if (p === "off") return false;
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "groq") return !!process.env.GROQ_API_KEY;
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  return true; // ollama needs no key
}

// ── Runaway guard: process-wide daily call counter ─────────────────
let dayKey = "";
let callsToday = 0;
function assertBudget(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; callsToday = 0; }
  if (callsToday >= DAILY_CALL_CAP) throw new Error("ai_budget_reached");
  callsToday += 1;
}
export function aiCallsToday(): { used: number; cap: number } {
  const today = new Date().toISOString().slice(0, 10);
  return { used: today === dayKey ? callsToday : 0, cap: DAILY_CALL_CAP };
}

// ── Tiny response cache: repeated identical asks cost nothing ──────
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; text: string }>();
function cacheGet(key: string): string | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;
  if (hit) cache.delete(key);
  return null;
}
function cachePut(key: string, text: string): void {
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), text });
}

let anthropicClient: Anthropic | null = null;

/** One short completion. Everything HazardLink asks an LLM goes through here. */
export async function chatComplete(input: {
  tier: AiTier;
  system: string;
  user: string;
  maxTokens: number;
  /** When set: Claude uses native structured outputs; other providers get the
   *  schema described in the prompt + JSON response mode. Callers parse. */
  jsonSchema?: Record<string, unknown>;
}): Promise<string> {
  const provider = aiProvider();
  if (provider === "off" || !isAiAvailable()) throw new Error("ai_not_configured");

  const wantJson = !!input.jsonSchema;
  const promptSystem = provider !== "anthropic" && wantJson
    ? input.system + "\n\nRespond with ONLY a single valid JSON object matching this JSON Schema, no markdown fences, no commentary:\n" + JSON.stringify(input.jsonSchema)
    : input.system;

  const key = `${provider}|${input.tier}|${wantJson ? "j" : "t"}|${promptSystem.length}|${input.user}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  assertBudget();

  let text: string;
  if (provider === "anthropic") {
    if (!anthropicClient) anthropicClient = new Anthropic();
    const msg = await anthropicClient.messages.create({
      model: input.tier === "smart" ? ANTHROPIC_MODEL : ANTHROPIC_MODEL_FAST,
      max_tokens: input.maxTokens,
      system: input.system,
      ...(wantJson ? { output_config: { format: { type: "json_schema", schema: input.jsonSchema as Record<string, unknown> } } } : {}),
      messages: [{ role: "user", content: input.user }],
    } as any);
    text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("").trim();
  } else if (provider === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.tier === "smart" ? GROQ_MODEL : GROQ_MODEL_FAST,
        max_tokens: input.maxTokens,
        ...(wantJson ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: input.user },
        ],
      }),
    });
    if (!r.ok) throw new Error(`ai_provider_error_${r.status}`);
    const b: any = await r.json();
    text = String(b?.choices?.[0]?.message?.content || "").trim();
  } else if (provider === "gemini") {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: promptSystem }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: { maxOutputTokens: input.maxTokens, ...(wantJson ? { responseMimeType: "application/json" } : {}) },
        }),
      },
    );
    if (!r.ok) throw new Error(`ai_provider_error_${r.status}`);
    const b: any = await r.json();
    text = String(b?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "").trim();
  } else {
    // ollama
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        ...(wantJson ? { format: "json" } : {}),
        options: { num_predict: input.maxTokens },
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: input.user },
        ],
      }),
    });
    if (!r.ok) throw new Error(`ai_provider_error_${r.status}`);
    const b: any = await r.json();
    text = String(b?.message?.content || "").trim();
  }

  if (!text) throw new Error("ai_empty_response");
  cachePut(key, text);
  return text;
}

/** The model label recorded in usage events / shown in status. */
export function aiModelLabel(tier: AiTier): string {
  const p = aiProvider();
  if (p === "anthropic") return tier === "smart" ? ANTHROPIC_MODEL : ANTHROPIC_MODEL_FAST;
  if (p === "groq") return "groq:" + (tier === "smart" ? GROQ_MODEL : GROQ_MODEL_FAST);
  if (p === "gemini") return "gemini:" + GEMINI_MODEL;
  if (p === "ollama") return "ollama:" + OLLAMA_MODEL;
  return "off";
}
