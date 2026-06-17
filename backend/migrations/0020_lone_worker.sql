-- Lone-worker safety: welfare check-in sessions + panic. Overall capability
-- (cleaners, techs, guards). Missed check-ins / panic raise an alarm.

CREATE TYPE lone_worker_status AS ENUM ('active', 'ended', 'alarm');

CREATE TABLE lone_worker_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status               lone_worker_status NOT NULL DEFAULT 'active',
  interval_minutes     integer NOT NULL DEFAULT 30,
  note                 text,
  started_at           timestamptz NOT NULL DEFAULT now(),
  last_check_in_at     timestamptz,
  next_check_in_due_at timestamptz,
  ended_at             timestamptz,
  alarm_reason         text,
  alarm_at             timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lws_org_idx    ON lone_worker_sessions (organisation_id);
CREATE INDEX lws_user_idx   ON lone_worker_sessions (user_id);
CREATE INDEX lws_status_idx ON lone_worker_sessions (status);
