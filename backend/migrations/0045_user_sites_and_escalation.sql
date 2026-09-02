-- Multi-site workflow. A user can belong to many sites; membership scopes
-- what supervisors and field staff see and where they land. Admins are
-- implicitly on every site. Plus escalation clocks for incidents and
-- permits, mirroring the spill escalation chain. Additive + idempotent.
CREATE TABLE IF NOT EXISTS user_sites (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_id     uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, building_id)
);
CREATE INDEX IF NOT EXISTS user_sites_org_building_idx ON user_sites (organisation_id, building_id);

ALTER TABLE security_incidents ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS nudged_at timestamptz;
