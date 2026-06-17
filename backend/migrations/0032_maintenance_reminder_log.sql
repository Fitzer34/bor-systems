-- Dedup log for the daily maintenance reminder digest.
--
-- The maintenance-reminder job emails each org's admins/supervisors once a day
-- when meters are due or certifications are expiring. This table guarantees one
-- digest per organisation per calendar day (unique org + sent_on), so restarts
-- or multiple ticks can't double-send. Additive + idempotent.
CREATE TABLE IF NOT EXISTS maintenance_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  sent_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_reminder_log_org_day ON maintenance_reminder_log (organisation_id, sent_on);
