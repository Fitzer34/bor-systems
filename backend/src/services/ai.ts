import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude-powered maintenance helpers:
 *   1. draftScopeOfWorks — turn a short job title + notes into a clear scope a
 *      contractor can quote against.
 *   2. rankQuotes — assess submitted contractor quotes on value (not just price)
 *      and recommend one, flagging suspicious outliers.
 *
 * Reads the key from ANTHROPIC_API_KEY (the SDK picks it up automatically).
 * Model defaults to Claude Opus 4.8 but can be overridden with ANTHROPIC_MODEL
 * (e.g. claude-sonnet-4-6 / claude-haiku-4-5) for a cheaper tier — no code change.
 * Non-streaming: both calls are short, well under the request timeout.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ai_not_configured");
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ─── 1. Scope of works ───────────────────────────────────────────────────────

export async function draftScopeOfWorks(input: {
  title: string;
  description?: string | null;
  trade?: string | null;
  building?: string | null;
}): Promise<string> {
  const c = getClient();
  const system =
    "You are a facilities-maintenance manager writing a clear, professional scope of works for a contractor to quote against. " +
    "Given a job title and any notes, produce a concise scope using short markdown sections: " +
    "**Objective**, **Scope of works** (bulleted tasks), **Materials / parts** (only if clearly implied), " +
    "**Access & site requirements**, **Compliance & safety**. " +
    "Be specific but never invent facts — do not make up dimensions, model numbers, quantities, or prices. " +
    "Where key information is missing, list it under an **Assumptions / to confirm** heading rather than guessing. " +
    "Output only the scope of works — no preamble, no sign-off, no commentary about your process.";
  const user = [
    `Job title: ${input.title}`,
    input.trade ? `Trade: ${input.trade}` : "",
    input.building ? `Site / building: ${input.building}` : "",
    input.description ? `Notes from the client:\n${input.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });
  return textOf(msg);
}

// ─── 2. Quote ranking ────────────────────────────────────────────────────────

export interface QuoteForRanking {
  id: string;
  contractorName: string;
  amountCents: number | null;
  proposedStartDate?: string | null;
  notes?: string | null;
}

export interface QuoteRanking {
  recommendedQuoteId: string; // "" if none acceptable
  summary: string;
  rankings: { quoteId: string; rank: number; valueComment: string }[];
  flags: string[];
}

export async function rankQuotes(input: {
  title: string;
  description?: string | null;
  quotes: QuoteForRanking[];
}): Promise<QuoteRanking> {
  const c = getClient();
  const system =
    "You are a facilities-maintenance manager assessing contractor quotes for a job. " +
    "Judge value for money — not simply the lowest price. Weigh price, proposed start date, and any notes. " +
    "Flag suspiciously low quotes (likely missing scope) and high outliers. Pick the best-value quote and explain briefly and practically. " +
    "Use the exact quote ids given. If none are acceptable, set recommendedQuoteId to an empty string. " +
    "Respond only with JSON matching the required schema.";
  const quoteLines = input.quotes
    .map(
      (q) =>
        `- id=${q.id} | ${q.contractorName} | ${q.amountCents != null ? "€" + (q.amountCents / 100).toFixed(0) : "no price"}` +
        `${q.proposedStartDate ? " | earliest start " + q.proposedStartDate : ""}` +
        `${q.notes ? " | notes: " + q.notes : ""}`,
    )
    .join("\n");
  const user =
    `Job: ${input.title}\n` +
    (input.description ? `Details: ${input.description}\n` : "") +
    `\nQuotes:\n${quoteLines}`;

  const schema = {
    type: "object",
    properties: {
      recommendedQuoteId: { type: "string" },
      summary: { type: "string" },
      rankings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quoteId: { type: "string" },
            rank: { type: "integer" },
            valueComment: { type: "string" },
          },
          required: ["quoteId", "rank", "valueComment"],
          additionalProperties: false,
        },
      },
      flags: { type: "array", items: { type: "string" } },
    },
    required: ["recommendedQuoteId", "summary", "rankings", "flags"],
    additionalProperties: false,
  } as const;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [{ role: "user", content: user }],
  });
  return JSON.parse(textOf(msg)) as QuoteRanking;
}
