-- Per-role permission overrides.
--
-- The app ships with sensible defaults per role (see services/permissions.ts:
-- DEFAULT_PERMISSIONS). An org can tune what each role can see/do by storing an
-- override here — a JSON map of permission-key → boolean that is merged on top
-- of the defaults at read time. Admin is always treated as fully allowed and is
-- never gated by an override. One row per (org, role); additive + idempotent.
CREATE TABLE IF NOT EXISTS role_permissions (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role            user_role NOT NULL,
  permissions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, role)
);
