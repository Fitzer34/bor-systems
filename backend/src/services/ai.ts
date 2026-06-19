import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude-powered maintenance helpers:
 *   1. draftScopeOfWorks — turn a short job title + notes into a clear scope a
 *      contractor can quote against.
 *   2. rankQuotes — assess submitted contractor quotes on value (not just price)
 *      and recommend one, flagging suspicious outliers.
 *
 * Reads the key from ANTHROPIC_API_KEY (the SDK picks it up automatically).
 *
 * Two cost tiers, both env-overridable with no code change:
 *   ANTHROPIC_MODEL       — "smart" tier for the open-ended Assistant. Default
 *                           Claude Opus 4.8 (best reasoning over the org's data).
 *   ANTHROPIC_MODEL_FAST  — "fast" tier for the focused helpers (scope draft,
 *                           quote ranking, work-request parse, incident triage,
 *                           asset summary). Default Claude Sonnet 4.6 — very
 *                           capable on these well-scoped tasks at a lower price.
 * Set ANTHROPIC_MODEL_FAST=claude-opus-4-8 to put the helpers back on Opus, or
 * =claude-haiku-4-5 to push helper cost lower once you've validated quality.
 * Non-streaming: every call is short, well under the request timeout.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-sonnet-4-6";

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
    model: MODEL_FAST,
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
    model: MODEL_FAST,
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
    model: MODEL_FAST,
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
    model: MODEL_FAST,
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
    model: MODEL_FAST,
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: user }],
  });
  return textOf(msg);
}

// ─── 7. Continuous-improvement suggestions ──────────────────────────────────
// Reads a summary of the org's maintenance reliability data and proposes
// concrete, prioritised preventive actions (the Continuous Improvement pillar).

export interface ImprovementSuggestion {
  title: string;
  area: string;
  observation: string;
  recommendation: string;
  impact: string; // low | medium | high
}

export async function suggestImprovements(input: { summary: string }): Promise<ImprovementSuggestion[]> {
  const c = getClient();
  const system =
    "You are a reliability engineer running continuous improvement for a facilities maintenance team. " +
    "Given a summary of their maintenance data (planned vs reactive work, repeat-offender assets, costs, PM compliance, assets past life), " +
    "propose concrete, prioritised improvement actions. Reference the actual assets and numbers from the summary; never invent data. " +
    "Prefer practical actions: add or adjust a PPM, root-cause review, replacement, training, or stock changes. " +
    "If there is too little data to be useful, return an empty list. Respond only with JSON matching the schema.";
  const schema = {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            area: { type: "string" },
            observation: { type: "string" },
            recommendation: { type: "string" },
            impact: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["title", "area", "observation", "recommendation", "impact"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  } as const;
  const msg = await c.messages.create({
    model: MODEL_FAST,
    max_tokens: 1500,
    system,
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [{ role: "user", content: input.summary }],
  });
  return (JSON.parse(textOf(msg)) as { suggestions: ImprovementSuggestion[] }).suggestions;
}

// ─── 6. Data assistant (ask-your-data, tool-using) ───────────────────────────
// A small agent loop: Claude answers questions about the org's own data by
// calling the tools the route provides (each backed by an org-scoped DB query),
// so all data access stays in the route and nothing is invented.

export interface AssistantToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export async function runDataAssistant(input: {
  question: string;
  tools: AssistantToolDef[];
  executeTool: (name: string, args: any) => Promise<unknown>;
}): Promise<string> {
  const c = getClient();
  const system =
    "You are HazardLink's assistant for a facilities team spanning cleaning, maintenance, and security. " +
    "Answer the user's question about THEIR data by calling the tools — maintenance jobs, security incidents, assets, and live counts. " +
    "Always fetch with tools before answering; never invent ids, names, dates, counts, or statuses. " +
    "Be concise and specific — cite real job titles, asset names, dates, and numbers from the results. " +
    "If the tools return nothing relevant, say so plainly and suggest what you could look up instead. Use short markdown.";

  // Loose typing on the SDK message/tool shapes keeps the tool-use round-trip
  // simple; the structured calls elsewhere stay strictly typed.
  const messages: any[] = [{ role: "user", content: input.question }];

  for (let i = 0; i < 6; i++) {
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      tools: input.tools as any,
      messages: messages as any,
    });
    if (msg.stop_reason !== "tool_use") return textOf(msg);

    const toolUses = (msg.content as any[]).filter((b) => b.type === "tool_use");
    messages.push({ role: "assistant", content: msg.content });

    const results: any[] = [];
    for (const tu of toolUses) {
      let out: unknown;
      try {
        out = await input.executeTool(tu.name, tu.input);
      } catch (e) {
        out = { error: (e as Error).message };
      }
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(out).slice(0, 12000),
      });
    }
    messages.push({ role: "user", content: results });
  }
  return "I couldn't finish that lookup — try a more specific question.";
}

// ─── 8. Safety Data Sheet extraction (strictly grounded) ─────────────────────
// Reads a Safety Data Sheet document (the uploaded PDF or a photo of the printed
// sheet) and returns its structured fields. Critically: it extracts ONLY what is
// written in that document — it never infers ingredients, hazards, or any value
// from outside knowledge of the product. Missing fields come back empty with a
// note in `warnings`, and a person verifies the record before it is trusted.

export interface SdsExtraction {
  isLikelySds: boolean;
  productName: string;
  manufacturer: string;
  productCode: string;
  signalWord: string; // "Danger" | "Warning" | ""
  pictograms: string[];
  hazardStatements: { code: string; text: string }[];
  precautionaryStatements: { code: string; text: string }[];
  ingredients: { name: string; cas: string; percent: string }[];
  firstAid: string;
  storageHandling: string;
  ppe: string;
  issueDate: string; // YYYY-MM-DD or ""
  revisionDate: string; // YYYY-MM-DD or ""
  warnings: string[];
}

export async function extractSdsFromDocument(input: {
  media: { kind: "pdf" | "image"; base64: string; mimeType: string };
}): Promise<SdsExtraction> {
  const c = getClient();
  const system =
    "You extract structured data from a Safety Data Sheet (SDS) — the standardised 16-section chemical-safety document (GHS / EU CLP). " +
    "Extract ONLY information that is explicitly written in the supplied document. " +
    "You MUST NOT infer, guess, complete, normalise, translate, or use any outside knowledge about the product or its ingredients. " +
    "If a value is not clearly present in the document, return an empty string (or empty array) for it and add a short note to `warnings` naming what is missing or unreadable. " +
    "Copy values exactly as written — CAS numbers, H- and P-statement codes, percentage ranges, dates. " +
    "Map dates to YYYY-MM-DD only when the document states them unambiguously; otherwise leave empty. " +
    "If the document is NOT a Safety Data Sheet, set isLikelySds to false and leave the fields empty. " +
    "Respond only with JSON matching the schema.";

  const schema = {
    type: "object",
    properties: {
      isLikelySds: { type: "boolean" },
      productName: { type: "string" },
      manufacturer: { type: "string" },
      productCode: { type: "string" },
      signalWord: { type: "string", enum: ["Danger", "Warning", ""] },
      pictograms: { type: "array", items: { type: "string" } },
      hazardStatements: {
        type: "array",
        items: {
          type: "object",
          properties: { code: { type: "string" }, text: { type: "string" } },
          required: ["code", "text"],
          additionalProperties: false,
        },
      },
      precautionaryStatements: {
        type: "array",
        items: {
          type: "object",
          properties: { code: { type: "string" }, text: { type: "string" } },
          required: ["code", "text"],
          additionalProperties: false,
        },
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, cas: { type: "string" }, percent: { type: "string" } },
          required: ["name", "cas", "percent"],
          additionalProperties: false,
        },
      },
      firstAid: { type: "string" },
      storageHandling: { type: "string" },
      ppe: { type: "string" },
      issueDate: { type: "string" },
      revisionDate: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: [
      "isLikelySds", "productName", "manufacturer", "productCode", "signalWord", "pictograms",
      "hazardStatements", "precautionaryStatements", "ingredients", "firstAid", "storageHandling",
      "ppe", "issueDate", "revisionDate", "warnings",
    ],
    additionalProperties: false,
  } as const;

  const docBlock =
    input.media.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.media.base64 } }
      : { type: "image", source: { type: "base64", media_type: input.media.mimeType, data: input.media.base64 } };

  const msg = await c.messages.create({
    model: MODEL, // safety-critical: use the strongest tier for accurate, faithful extraction
    max_tokens: 2500,
    system,
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          docBlock as any,
          { type: "text", text: "Extract the Safety Data Sheet fields from the attached document, following the rules exactly. Do not add anything that is not written on the sheet." },
        ] as any,
      },
    ],
  });
  return JSON.parse(textOf(msg)) as SdsExtraction;
}
