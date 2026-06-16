-- PPM contractor scheduling.
-- When a planned task comes due, the system emails the contractor a magic link
-- (no login) where they pick a visit date; staff then confirm it, which stamps
-- ppms.scheduled_date. One row per outreach attempt — latest is the live one.

ALTER TABLE ppms ADD COLUMN scheduled_date date;

CREATE TYPE ppm_schedule_status AS ENUM ('sent', 'proposed', 'confirmed', 'declined', 'cancelled');

CREATE TABLE ppm_schedule_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  ppm_id             uuid NOT NULL REFERENCES ppms(id) ON DELETE CASCADE,
  token              text NOT NULL UNIQUE,
  status             ppm_schedule_status NOT NULL DEFAULT 'sent',
  sent_to_email      text,
  email_delivered    boolean NOT NULL DEFAULT false,
  proposed_date      date,
  confirmed_date     date,
  contractor_note    text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at         timestamptz NOT NULL,
  responded_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppm_sched_ppm_idx ON ppm_schedule_requests (ppm_id);
CREATE INDEX ppm_sched_org_idx ON ppm_schedule_requests (organisation_id);
