-- Photo proof on a checkpoint scan.
--
-- A cleaner (or guard) on their round scans a checkpoint's QR, confirms the
-- area, and snaps a picture of it. Nullable — not every scan carries a photo.
-- The upload is public + no-login (the scan page is), rate-limited, and stored
-- to R2 (same path as inspection/incident/job photos).
ALTER TABLE checkpoint_scans ADD COLUMN IF NOT EXISTS photo_url text;
