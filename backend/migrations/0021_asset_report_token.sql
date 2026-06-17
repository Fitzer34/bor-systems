-- Cross-discipline moat: every asset gets a QR "report a fault" token. Any
-- worker scans it (no login) and raises a maintenance job against the asset.

ALTER TABLE assets ADD COLUMN report_token text;

-- Backfill existing assets with a random token (gen_random_uuid is core PG13+).
UPDATE assets SET report_token = replace(gen_random_uuid()::text, '-', '') WHERE report_token IS NULL;

-- Unique lookup (NULLs are distinct in Postgres, so future-safe).
CREATE UNIQUE INDEX assets_report_token_idx ON assets (report_token);
