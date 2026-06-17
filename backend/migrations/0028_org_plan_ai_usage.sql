-- Subscription plan per organisation + AI usage metering.
--
-- Plans gate the monthly AI Assistant allowance — the one AI surface expensive
-- enough to meter. The everyday helpers (parse / triage / summary / scope) stay
-- free and ambient. ai_usage_events is an append-only log of metered AI calls;
-- the Assistant quota is enforced as a SOFT cap (we surface usage and nudge to
-- upgrade, we never hard-block a task mid-flight).
--
-- Existing orgs default to 'starter'. Additive + idempotent.
DO $$ BEGIN
  CREATE TYPE org_plan AS ENUM ('starter', 'growth', 'enterprise');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS plan org_plan NOT NULL DEFAULT 'starter';

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_org_time_idx ON ai_usage_events (organisation_id, created_at);
