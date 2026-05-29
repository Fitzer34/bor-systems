-- BOR Systems — friendly name + location note for hangers.
--
-- Mirrors the gateway columns added in 0011. Hangers can now be labelled
-- with a human-readable name ("Ward 4B - main bathroom") instead of being
-- referred to by raw DevEUI in the alerts feed + dispatch view, and the
-- locationNote field gives cleaners precise install-location detail
-- ("behind the first stall on the right", "on the wall opposite the
-- handwash sinks").

ALTER TABLE hangers
  ADD COLUMN IF NOT EXISTS name           text,
  ADD COLUMN IF NOT EXISTS location_note  text;
