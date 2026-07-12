/**
 * Microsoft Teams integration — an org pastes an "incoming webhook" URL from
 * their Teams channel into Settings → Integrations, and org-broadcast events
 * (overdue work, escalated spills, expiring certs…) post a card there.
 *
 * Best-effort by design: a dead webhook must never break the notification
 * path, so every failure is swallowed and logged.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const SETTINGS_KEY = "integrations";

export interface IntegrationSettings {
  teamsWebhookUrl: string | null;
}

export async function getIntegrationSettings(orgId: string): Promise<IntegrationSettings> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.organisationId, orgId), eq(schema.settings.key, SETTINGS_KEY)))
    .limit(1);
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const url = typeof v.teamsWebhookUrl === "string" ? v.teamsWebhookUrl : null;
  return { teamsWebhookUrl: url && /^https:\/\//.test(url) ? url : null };
}

export async function setIntegrationSettings(orgId: string, next: IntegrationSettings): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ organisationId: orgId, key: SETTINGS_KEY, value: next as unknown as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.settings.organisationId, schema.settings.key],
      set: { value: next as unknown as object, updatedAt: new Date() },
    });
}

/** Post a simple card to the org's Teams channel, if configured. */
export async function postTeamsCard(orgId: string, title: string, body: string): Promise<void> {
  try {
    const { teamsWebhookUrl } = await getIntegrationSettings(orgId);
    if (!teamsWebhookUrl) return;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    await fetch(teamsWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        summary: title,
        themeColor: "2563EB",
        title,
        text: body,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    console.error("teams webhook post failed:", err);
  }
}
