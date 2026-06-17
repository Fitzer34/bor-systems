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

// ─── 3. Voice / free-text → structured work request ──────────────────────────
// Powers "Voice → work order": a worker's spoken (transcribed) or typed field
// report becomes a structured job the user confirms before it is created.

export interface WorkRequestParse {
  title: string;
  description: string;
  priority: string; // one of the allowed values
  assetId: string; // matched id, or "" if none
  buildingId: string; // matched id, or "" if none
  needsClarification: string; // a short question if too vague, else ""
}

export async function parseWorkRequest(input: {
  text: string;
  assets: { id: string; name: string }[];
  buildings: { id: string; name: string }[];
  priorities: string[];
}): Promise<WorkRequestParse> {
  const c = getClient();
  const system =
    "You turn a maintenance worker's spoken or typed field report into a structured work order. " +
    "Write a short, specific title and a clear, professional description. " +
    "Choose the priority from the allowed list based on urgency and safety; if unclear, choose the most routine option. " +
    "Match the asset and building ONLY to an entry in the provided lists, and only when the report clearly refers to it — return its exact id, otherwise an empty string. " +
    "Never invent assets, locations, model numbers, quantities, or any fact not in the report. " +
    "If the report is too vague to act on, put one short clarifying question in needsClarification; otherwise an empty string. " +
    "Respond only with JSON matching the schema.";
  const assetLines = input.assets.length
    ? input.assets.map((a) => `- id=${a.id} | ${a.name}`).join("\n")
    : "(none on file)";
  const buildingLines = input.buildings.length
    ? input.buildings.map((b) => `- id=${b.id} | ${b.name}`).join("\n")
    : "(none on file)";
  const user =
    `Field report:\n${input.text}\n\n` +
    `Allowed priorities: ${input.priorities.join(", ")}\n\n` +
    `Known assets:\n${assetLines}\n\n` +
    `Known buildings:\n${buildingLines}`;

  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      priority: { type: "string", enum: input.priorities },
      assetId: { type: "string" },
      buildingId: { type: "string" },
      needsClarification: { type: "string" },
    },
    required: ["title", "description", "priority", "assetId", "buildingId", "needsClarification"],
    additionalProperties: false,
  };

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 800,
    system,
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [{ role: "user", content: user }],
  });
  return JSON.parse(textOf(msg)) as WorkRequestParse;
}

// ─── 4. Incident triage ──────────────────────────────────────────────────────
// Suggests a severity + immediate actions when a security incident is logged.

export interface IncidentTriage {
  severity: string; // one of the allowed values
  suggestedActions: string[];
  rationale: string;
}

export async function triageIncident(input: {
  title: string;
  description?: string | null;
  kind?: string | null;
  severities: string[];
}): Promise<IncidentTriage> {
  const c = getClient();
  const system =
    "You are a site security manager triaging a reported incident. " +
    "Assess severity from the allowed list, weighing risk to people, property, and operations. " +
    "Give 2-4 short, concrete actions for the responder to take now. " +
    "Be measured — do not over- or under-state risk, and never invent details. " +
    "Respond only with JSON matching the schema.";
  const user =
    `Incident: ${input.title}\n` +
    (input.kind ? `Type: ${input.kind}\n` : "") +
    (input.description ? `Details: ${input.description}\n` : "") +
    `\nAllowed severities (low to high): ${input.severities.join(", ")}`;

  const schema = {
    type: "object",
    properties: {
      severity: { type: "string", enum: input.severities },
      suggestedActions: { type: "array", items: { type: "string" } },
      rationale: { type: "string" },
    },
    required: ["severity", "suggestedActions", "rationale"],
    additionalProperties: false,
  };

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [{ role: "user", content: user }],
  });
  return JSON.parse(textOf(msg)) as IncidentTriage;
}

// ─── 5. Asset history summary ────────────────────────────────────────────────
// One-tap plain-English brief of everything that has happened to an asset.

export async function summariseAssetHistory(input: {
  assetName: string;
  jobs: { title: string; status: string; completedAt?: string | null; note?: string | null }[];
  incidents: { title: string; severity: string; status: string; when?: string | null }[];
}): Promise<string> {
  const c = getClient();
  const system =
    "You are a facilities manager briefing a colleague on one asset. " +
    "In short markdown, cover: recurring or recent issues, when it was last worked on, anything still open, and a one-line health read. " +
    "Use only the records provided — never invent. If there is little history, say so plainly. No preamble.";
  const jobLines = input.jobs.length
    ? input.jobs
        .map(
          (j) =>
            `- [${j.status}] ${j.title}` +
            `${j.completedAt ? " (done " + j.completedAt.slice(0, 10) + ")" : ""}` +
            `${j.note ? " — " + j.note : ""}`,
        )
        .join("\n")
    : "(no maintenance jobs on file)";
  const incLines = input.incidents.length
    ? input.incidents
        .map((i) => `- [${i.severity}/${i.status}] ${i.title}${i.when ? " (" + i.when.slice(0, 10) + ")" : ""}`)
        .join("\n")
    : "(no incidents on file)";
  const user = `Asset: ${input.assetName}\n\nMaintenance jobs:\n${jobLines}\n\nIncidents:\n${incLines}`;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: user }],
  });
  return textOf(msg);
}
