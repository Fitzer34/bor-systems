-- Growth avenues (customer acquisition surfaces).
--
-- 1. Contractor loop: a contractor who receives a tender can CLAIM a profile
--    via a no-login magic link, keep a reusable document vault (insurance,
--    SafePass, RAMS…) with expiry dates, and opt in to a PUBLIC cross-org
--    directory that gives inbound SEO + two-sided pull.
-- 2. Visitor management: expected visitors + walk-in sign-in/sign-out per site.
-- 3. Partner leads: inbound form on the marketing site (distributors,
--    installers, consultancies, franchises).
-- 4. White-label branding on organisations (logo + brand colour for emails
--    and the client portal).
-- 5. WhatsApp as a per-user notification channel (Twilio, env-gated).
--
-- Additive + idempotent (IF NOT EXISTS everywhere) so a re-run is a no-op.

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS claim_token   text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS claimed_at    timestamptz;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS public_listed boolean NOT NULL DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS services      text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS county        text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS bio           text;
CREATE UNIQUE INDEX IF NOT EXISTS contractors_claim_token_idx
  ON contractors (claim_token) WHERE claim_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS contractor_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contractor_id   uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'other',  -- insurance|safe_pass|manual_handling|rams|method_statement|cert|other
  name            text NOT NULL,
  url             text NOT NULL,
  expires_on      date,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractor_documents_contractor_idx ON contractor_documents (contractor_id);
CREATE INDEX IF NOT EXISTS contractor_documents_org_idx        ON contractor_documents (organisation_id);

CREATE TABLE IF NOT EXISTS visitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id     uuid REFERENCES buildings(id) ON DELETE SET NULL,
  name            text NOT NULL,
  company         text,
  host            text,
  purpose         text,
  badge           text,
  expected_at     timestamptz,
  signed_in_at    timestamptz,
  signed_out_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitors_org_idx      ON visitors (organisation_id, created_at);
CREATE INDEX IF NOT EXISTS visitors_building_idx ON visitors (building_id);

CREATE TABLE IF NOT EXISTS partner_leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  company    text,
  email      text NOT NULL,
  phone      text,
  segment    text,  -- distributor|installer|consultancy|franchise|other
  message    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS brand_color text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS logo_url    text;

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS whatsapp boolean NOT NULL DEFAULT false;
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'whatsapp';
