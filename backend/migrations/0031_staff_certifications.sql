-- Workforce competency: staff certifications / qualifications with expiry.
--
-- Tracks who is qualified for what (Gas Safe, working-at-heights, first aid,
-- SIA licence…), when it was issued and when it expires — so expiring tickets
-- surface before they lapse. Spans all on-site roles. Additive + idempotent.
CREATE TABLE IF NOT EXISTS staff_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer text,
  reference text,
  issued_on date,
  expires_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_certifications_org_idx ON staff_certifications (organisation_id);
CREATE INDEX IF NOT EXISTS staff_certifications_user_idx ON staff_certifications (user_id);
