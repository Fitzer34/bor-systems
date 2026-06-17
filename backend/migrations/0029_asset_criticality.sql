-- Asset criticality — the core of Risk-Based Maintenance.
--
-- Ranks how badly a failure of this asset hurts (safety / operations / cost),
-- so PPMs and jobs can be prioritised by risk, not just by date. A boiler that
-- shuts a building is 'critical'; a spare desk fan is 'low'. Existing assets
-- default to 'medium'. Additive + idempotent.
DO $$ BEGIN
  CREATE TYPE asset_criticality AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS criticality asset_criticality NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS assets_criticality_idx ON assets (organisation_id, criticality);
