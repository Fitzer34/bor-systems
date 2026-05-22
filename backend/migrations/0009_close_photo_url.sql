-- BOR Systems — proof-of-resolution photo on alerts.
--
-- When the cleaner closes an alert via the iOS/Android app, they can
-- attach a photo of the area showing it's been cleaned. URL of the
-- uploaded image goes here. Used by:
--   - Admin's alert detail view (visual confirmation)
--   - Compliance PDF reports (insurance evidence)
--   - Dispute resolution (if a tenant complains the area wasn't cleaned)

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS close_photo_url TEXT;
