import { and, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";
import { escalateAlert } from "./alert-flow.js";

const TICK_MS = 30_000;

export function startEscalationTimer(): NodeJS.Timeout {
  return setInterval(tick, TICK_MS).unref();
}

async function tick(): Promise<void> {
  const cutoff = new Date(Date.now() - config.RESOLUTION_TIMER_MINUTES * 60_000);
  const due = await db
    .select({ id: schema.alerts.id })
    .from(schema.alerts)
    .where(
      and(
        isNull(schema.alerts.closedAt),
        isNull(schema.alerts.escalatedAt),
        lte(schema.alerts.openedAt, cutoff),
      ),
    );
  for (const a of due) await escalateAlert(a.id);
}

export async function _runOnceForTests(): Promise<void> {
  await tick();
}
