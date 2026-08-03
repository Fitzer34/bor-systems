-- Staff leave / time off.
--
-- One row per leave booking or request. A supervisor/admin booking someone off
-- is created straight to 'approved' (the "mark somebody off this week" flow);
-- a field-staff self-request starts 'pending' and a supervisor approves or
-- declines it. Dates are inclusive. Additive + idempotent.
CREATE TABLE IF NOT EXISTS leave_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'annual',   -- annual|sick|unpaid|other
  starts_on       date NOT NULL,
  ends_on         date NOT NULL,
  note            text,
  status          text NOT NULL DEFAULT 'pending',  -- pending|approved|declined|cancelled
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_org_dates_idx ON leave_requests (organisation_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS leave_user_idx      ON leave_requests (user_id);
