-- Profile + floor-plan field additions.
--
--   • users.avatar_url     — profile picture URL (uploaded via /uploads).
--   • users.last_active_at — stamped on each authenticated request (throttled),
--                            so the team list can show "active 2m ago".
--   • hangers.last_lifted_at — when this hanger's sign was last lifted, so the
--                            floor-plan / device list can show recency without
--                            scanning the events table every render.
-- Additive + idempotent.

ALTER TABLE users   ADD COLUMN IF NOT EXISTS avatar_url      text;
ALTER TABLE users   ADD COLUMN IF NOT EXISTS last_active_at  timestamptz;
ALTER TABLE hangers ADD COLUMN IF NOT EXISTS last_lifted_at  timestamptz;
