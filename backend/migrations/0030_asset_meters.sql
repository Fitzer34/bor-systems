-- Predictive maintenance: usage meters + readings.
--
-- A meter tracks an asset's accumulating usage (runtime hours, cycles, km…).
-- Each reading updates current_value; when it passes last_service_value +
-- interval_value the meter is "due", so maintenance is driven by actual usage
-- rather than only the calendar. Marking it serviced rolls last_service_value
-- up to current_value. Values are whole units. Additive + idempotent.
CREATE TABLE IF NOT EXISTS asset_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text,
  interval_value integer,
  last_service_value integer NOT NULL DEFAULT 0,
  current_value integer NOT NULL DEFAULT 0,
  last_reading_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_meters_org_idx ON asset_meters (organisation_id);
CREATE INDEX IF NOT EXISTS asset_meters_asset_idx ON asset_meters (asset_id);

CREATE TABLE IF NOT EXISTS meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES asset_meters(id) ON DELETE CASCADE,
  value integer NOT NULL,
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meter_readings_meter_idx ON meter_readings (meter_id, recorded_at);
