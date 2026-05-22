import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config.js";

export const SETTING_KEYS = {
  RESOLUTION_TIMER: "resolution_timer_minutes",
  ACKNOWLEDGEMENT_TIMER: "acknowledgement_timer_minutes",
  LOW_BATTERY_THRESHOLD: "low_battery_threshold_pct",
  DEFAULT_AUDIBLE_ALARM: "default_audible_alarm_enabled",
  EXPECTED_CLEANING_TIME: "expected_cleaning_time_minutes",
  // After-hours / quiet mode.
  // night_start_hour and night_end_hour are integers 0–23 in the org's
  // local timezone. If both are zero (default) night mode is off.
  // night_contact_user_id is the user notified during night hours
  // instead of broadcasting to all on-duty cleaners (typically a
  // building security guard or out-of-hours supervisor).
  NIGHT_START_HOUR:     "night_start_hour",
  NIGHT_END_HOUR:       "night_end_hour",
  NIGHT_CONTACT_USER:   "night_contact_user_id",
  NIGHT_QUIET_PUSH:     "night_quiet_push_enabled",
} as const;

const DEFAULTS = {
  RESOLUTION_TIMER: 15,
  ACKNOWLEDGEMENT_TIMER: 5,
  LOW_BATTERY_THRESHOLD: 20,
  DEFAULT_AUDIBLE_ALARM: false,
  EXPECTED_CLEANING_TIME: 10,
  NIGHT_START_HOUR: 0,        // 0 = disabled
  NIGHT_END_HOUR:   0,
  NIGHT_QUIET_PUSH: false,
};

async function readNumber(orgId: string, key: string, fallback: number): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.organisationId, orgId), eq(schema.settings.key, key)))
    .limit(1);
  if (!row) return fallback;
  const v = (row.value as { value?: unknown; minutes?: unknown; pct?: unknown }).value
    ?? (row.value as { minutes?: unknown }).minutes
    ?? (row.value as { pct?: unknown }).pct;
  return typeof v === "number" && v >= 0 ? v : fallback;
}

async function readBool(orgId: string, key: string, fallback: boolean): Promise<boolean> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.organisationId, orgId), eq(schema.settings.key, key)))
    .limit(1);
  if (!row) return fallback;
  const v = (row.value as { value?: unknown }).value;
  return typeof v === "boolean" ? v : fallback;
}

export async function getResolutionTimerMinutes(orgId: string): Promise<number> {
  return readNumber(orgId, SETTING_KEYS.RESOLUTION_TIMER, config.RESOLUTION_TIMER_MINUTES);
}
export async function getAcknowledgementTimerMinutes(orgId: string): Promise<number> {
  return readNumber(orgId, SETTING_KEYS.ACKNOWLEDGEMENT_TIMER, DEFAULTS.ACKNOWLEDGEMENT_TIMER);
}
export async function getLowBatteryThreshold(orgId: string): Promise<number> {
  return readNumber(orgId, SETTING_KEYS.LOW_BATTERY_THRESHOLD, DEFAULTS.LOW_BATTERY_THRESHOLD);
}
export async function getDefaultAudibleAlarm(orgId: string): Promise<boolean> {
  return readBool(orgId, SETTING_KEYS.DEFAULT_AUDIBLE_ALARM, DEFAULTS.DEFAULT_AUDIBLE_ALARM);
}
export async function getExpectedCleaningTimeMinutes(orgId: string): Promise<number> {
  return readNumber(orgId, SETTING_KEYS.EXPECTED_CLEANING_TIME, DEFAULTS.EXPECTED_CLEANING_TIME);
}

async function readString(orgId: string, key: string, fallback: string | null): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(and(eq(schema.settings.organisationId, orgId), eq(schema.settings.key, key)))
    .limit(1);
  if (!row) return fallback;
  const v = (row.value as { value?: unknown; userId?: unknown }).value
        ?? (row.value as { userId?: unknown }).userId;
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/**
 * Returns true if the current hour falls within the org's configured
 * after-hours window (start/end in 0-23 local-hour ints, server time
 * for now — TODO: per-org timezone).
 *
 * Wraps across midnight when end < start (e.g. start=22, end=6).
 */
export async function isNightMode(orgId: string, now: Date = new Date()): Promise<boolean> {
  const [start, end] = await Promise.all([
    readNumber(orgId, SETTING_KEYS.NIGHT_START_HOUR, DEFAULTS.NIGHT_START_HOUR),
    readNumber(orgId, SETTING_KEYS.NIGHT_END_HOUR,   DEFAULTS.NIGHT_END_HOUR),
  ]);
  if (start === 0 && end === 0) return false;  // disabled
  const h = now.getHours();
  return start <= end ? (h >= start && h < end) : (h >= start || h < end);
}

export async function getNightContactUserId(orgId: string): Promise<string | null> {
  return readString(orgId, SETTING_KEYS.NIGHT_CONTACT_USER, null);
}

export async function getNightQuietPush(orgId: string): Promise<boolean> {
  return readBool(orgId, SETTING_KEYS.NIGHT_QUIET_PUSH, DEFAULTS.NIGHT_QUIET_PUSH);
}

export async function setNumber(orgId: string, key: string, value: number): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ organisationId: orgId, key, value: { value } })
    .onConflictDoUpdate({
      target: [schema.settings.organisationId, schema.settings.key],
      set: { value: { value }, updatedAt: new Date() },
    });
}

export async function setBool(orgId: string, key: string, value: boolean): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ organisationId: orgId, key, value: { value } })
    .onConflictDoUpdate({
      target: [schema.settings.organisationId, schema.settings.key],
      set: { value: { value }, updatedAt: new Date() },
    });
}
