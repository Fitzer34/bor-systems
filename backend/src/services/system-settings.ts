import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";

export const SETTING_KEYS = {
  RESOLUTION_TIMER: "resolution_timer_minutes",
  ACKNOWLEDGEMENT_TIMER: "acknowledgement_timer_minutes",
  LOW_BATTERY_THRESHOLD: "low_battery_threshold_pct",
  DEFAULT_AUDIBLE_ALARM: "default_audible_alarm_enabled",
  EXPECTED_CLEANING_TIME: "expected_cleaning_time_minutes",
} as const;

const DEFAULTS = {
  RESOLUTION_TIMER: 15,
  ACKNOWLEDGEMENT_TIMER: 5,
  LOW_BATTERY_THRESHOLD: 20,
  DEFAULT_AUDIBLE_ALARM: false,
  EXPECTED_CLEANING_TIME: 10,
};

async function readNumber(key: string, fallback: number): Promise<number> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  if (!row) return fallback;
  const v = (row.value as { value?: unknown; minutes?: unknown; pct?: unknown }).value
    ?? (row.value as { minutes?: unknown }).minutes
    ?? (row.value as { pct?: unknown }).pct;
  return typeof v === "number" && v >= 0 ? v : fallback;
}

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  if (!row) return fallback;
  const v = (row.value as { value?: unknown }).value;
  return typeof v === "boolean" ? v : fallback;
}

export async function getResolutionTimerMinutes(): Promise<number> {
  return readNumber(SETTING_KEYS.RESOLUTION_TIMER, config.RESOLUTION_TIMER_MINUTES);
}

export async function getAcknowledgementTimerMinutes(): Promise<number> {
  return readNumber(SETTING_KEYS.ACKNOWLEDGEMENT_TIMER, DEFAULTS.ACKNOWLEDGEMENT_TIMER);
}

export async function getLowBatteryThreshold(): Promise<number> {
  return readNumber(SETTING_KEYS.LOW_BATTERY_THRESHOLD, DEFAULTS.LOW_BATTERY_THRESHOLD);
}

export async function getDefaultAudibleAlarm(): Promise<boolean> {
  return readBool(SETTING_KEYS.DEFAULT_AUDIBLE_ALARM, DEFAULTS.DEFAULT_AUDIBLE_ALARM);
}

export async function getExpectedCleaningTimeMinutes(): Promise<number> {
  return readNumber(SETTING_KEYS.EXPECTED_CLEANING_TIME, DEFAULTS.EXPECTED_CLEANING_TIME);
}

export async function setNumber(key: string, value: number): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value: { value } })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: { value }, updatedAt: new Date() } });
}

export async function setBool(key: string, value: boolean): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value: { value } })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: { value }, updatedAt: new Date() } });
}
