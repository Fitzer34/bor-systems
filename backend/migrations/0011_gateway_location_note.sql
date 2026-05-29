-- BOR Systems — free-form location note for gateways.
--
-- Admins use this to describe where in the building the device lives —
-- "behind reception desk", "on shelf above fridge", "Floor 2 server
-- cupboard" — so when a cleaner needs to power-cycle one they can find
-- it without help from the installer. Surfaces in the iOS gateway edit
-- screen and the web Manage → Gateways page.

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS location_note text;
