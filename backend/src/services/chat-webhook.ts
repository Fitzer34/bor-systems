/**
 * Outbound chat-platform webhook integration.
 *
 * Many cleaning companies coordinate on Slack or Microsoft Teams. They
 * want alerts posted into a channel as well as (or instead of) push
 * notifications to individual cleaners. This service handles posting
 * formatted messages to either platform.
 *
 * Configuration lives in the existing `settings` table per-org under keys:
 *   slack_webhook_url    — Slack incoming-webhook URL
 *   teams_webhook_url    — Microsoft Teams incoming-webhook URL
 *
 * Both Slack and Teams accept similar "Block Kit"-style JSON payloads.
 * We post a compact version: title, location, action link.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const SLACK_KEY = "slack_webhook_url";
const TEAMS_KEY = "teams_webhook_url";

async function getWebhookUrl(orgId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.organisationId, orgId), eq(schema.settings.key, key)))
    .limit(1);
  if (!row) return null;
  const v = (row.value as { value?: unknown; url?: unknown }).value
        ?? (row.value as { url?: unknown }).url;
  return typeof v === "string" && v.startsWith("https://") ? v : null;
}

export interface ChatMessage {
  orgId: string;
  title: string;
  body: string;
  /**
   * Optional severity colour. Slack uses these on attachment sidebars,
   * Teams uses them as theme colours. Hex without leading #.
   */
  colour?: "ff0000" | "ff8800" | "00aa00" | "888888";
  /** Optional link the user can click to open the alert in the web app. */
  url?: string;
  /** Optional pre-formatted lines (location, response time, etc.). */
  fields?: Array<{ label: string; value: string }>;
}

export async function postToChatPlatforms(msg: ChatMessage): Promise<void> {
  await Promise.all([
    postToSlack(msg).catch((e) => console.warn("slack post failed:", e?.message)),
    postToTeams(msg).catch((e) => console.warn("teams post failed:", e?.message)),
  ]);
}

async function postToSlack(msg: ChatMessage): Promise<void> {
  const url = await getWebhookUrl(msg.orgId, SLACK_KEY);
  if (!url) return;

  const colour = "#" + (msg.colour ?? "ff8800");
  const payload = {
    text: msg.title,
    attachments: [{
      color: colour,
      title: msg.title,
      text: msg.body,
      ...(msg.url ? { title_link: msg.url } : {}),
      fields: (msg.fields ?? []).map((f) => ({
        title: f.label,
        value: f.value,
        short: true,
      })),
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function postToTeams(msg: ChatMessage): Promise<void> {
  const url = await getWebhookUrl(msg.orgId, TEAMS_KEY);
  if (!url) return;

  // MessageCard schema — older but works with all Teams incoming-webhook
  // connectors. New "Adaptive Cards" require the workflow-based connector.
  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: msg.colour ?? "ff8800",
    summary: msg.title,
    title: msg.title,
    text: msg.body,
    sections: msg.fields && msg.fields.length > 0
      ? [{
          facts: msg.fields.map((f) => ({ name: f.label, value: f.value })),
        }]
      : undefined,
    potentialAction: msg.url
      ? [{
          "@type": "OpenUri",
          name: "Open in Zero Slip Systems",
          targets: [{ os: "default", uri: msg.url }],
        }]
      : undefined,
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
