-- Completion dockets: the contractor's no-login proof-of-work record.
-- One row per docket link sent for a job. Submitting captures outcome,
-- work done, parts, time on site, photo/video evidence, further-repairs
-- recommendation (which can spawn a follow-up job + quote request), a
-- safety declaration and a drawn signature. Additive + idempotent.
CREATE TABLE IF NOT EXISTS job_dockets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id             uuid NOT NULL REFERENCES maintenance_jobs(id) ON DELETE CASCADE,
  contractor_id      uuid REFERENCES contractors(id) ON DELETE SET NULL,
  token              text NOT NULL,
  status             text NOT NULL DEFAULT 'sent',   -- sent|submitted
  outcome            text,                           -- fixed|temporary_fix|not_completed
  back_in_service    boolean,
  work_done          text,
  parts              jsonb NOT NULL DEFAULT '[]',    -- [{name, qty}]
  arrived_time       text,                           -- "HH:MM" as entered on site
  left_time          text,
  further_repairs    boolean,
  further_details    text,
  further_urgency    text,                           -- routine|urgent|emergency
  wants_quote        boolean,
  safety_concerns    text,                           -- empty/null = none reported
  method_confirmed   boolean,
  signed_name        text,
  signature_data_url text,                           -- PNG data URL from the canvas
  media              jsonb NOT NULL DEFAULT '[]',    -- [{url, kind, label, uploadedAt}]
  followup_job_id    uuid REFERENCES maintenance_jobs(id) ON DELETE SET NULL,
  sent_at            timestamptz NOT NULL DEFAULT now(),
  submitted_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_dockets_token_idx ON job_dockets (token);
CREATE INDEX IF NOT EXISTS job_dockets_job_idx ON job_dockets (job_id);
