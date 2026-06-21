-- Notifications centre: a per-user in-app feed + per-user delivery preferences.
--
-- The existing `notifications` table is a delivery LOG (one row per push/sms/
-- email send, tied to an alert). It stays untouched. This adds:
--   • user_notifications        — the bell-icon feed each user reads/clears.
--   • notification_preferences  — per-user, per-event-type channel choices.
--
-- A generated notification always lands in user_notifications (in-app), then
-- fans out to email / sms per the user's preferences. Additive + idempotent.

CREATE TABLE IF NOT EXISTS user_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text NOT NULL,           -- event type, e.g. 'spill.open', 'wo.overdue'
  title           text NOT NULL,
  body            text NOT NULL,
  entity_type     text,                    -- 'alert' | 'job' | 'ppm' | 'part' | ...
  entity_id       uuid,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notifications_user_read_idx ON user_notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS user_notifications_org_created_idx ON user_notifications (organisation_id, created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  in_app          boolean NOT NULL DEFAULT true,
  email           boolean NOT NULL DEFAULT false,
  sms             boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, event_type)
);

-- Dedup guard for generated notifications: at most one notification per
-- (organisation, type, entity, calendar-day). Mirrors maintenance_reminder_log
-- — a row is claimed via INSERT … ON CONFLICT DO NOTHING; the first caller wins,
-- repeat ticks for the same overdue thing on the same day are suppressed.
-- dedup_key encodes "type|entityId|YYYY-MM-DD".
CREATE TABLE IF NOT EXISTS notification_dedup (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  dedup_key       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, dedup_key)
);
