-- BOR Systems — sign-side UWB precision-finding tags.
--
-- Each wet floor sign has a small BLE+UWB module embedded in its handle
-- alongside the magnet that triggers the hanger's Hall sensor. When a
-- spill alert fires the cleaner taps "Find sign" in the iOS/Android app,
-- which connects to the tag over BLE, then opens a UWB session to show a
-- direction arrow + cm-accurate distance (AirTag-style).
--
-- One tag is paired to one hanger. Phones without UWB (~30% of devices in
-- 2026) fall back to the zone-pin floor plan view that already exists.

CREATE TABLE IF NOT EXISTS sign_tags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- BLE service-instance UUID this tag advertises. Format matches what
  -- the iOS NearbyInteraction / Android UWB API code scans for.
  ble_uuid          TEXT NOT NULL,

  -- UWB MAC-like address used during ranging (8 hex chars). Burned at
  -- factory; we read it from the tag during initial pairing.
  uwb_address       TEXT NOT NULL,

  -- Which hanger this sign normally sits on. Null until paired (admin
  -- pairs via the iOS "Pair sign" flow during install). When the cloud
  -- emits a spill alert for a hanger, it looks up the paired tag so the
  -- mobile app knows which BLE peer to scan for.
  paired_hanger_id  UUID REFERENCES hangers(id) ON DELETE SET NULL,

  -- Battery health. The tag reports this every BLE advertise; backend
  -- raises a low-battery alert at <20%.
  battery_pct       SMALLINT,

  -- Heartbeat — last time any phone in the customer's org actually saw
  -- this tag advertising. Lets the admin dashboard show "tag offline"
  -- for missing/dead-battery tags.
  last_seen_at      TIMESTAMP WITH TIME ZONE,

  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- BLE UUID and UWB address must be unique across all orgs — they're
-- physical device identifiers burned at factory.
CREATE UNIQUE INDEX IF NOT EXISTS sign_tags_ble_uuid_unique  ON sign_tags(ble_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS sign_tags_uwb_addr_unique  ON sign_tags(uwb_address);
CREATE INDEX        IF NOT EXISTS sign_tags_paired_hanger_idx ON sign_tags(paired_hanger_id);
CREATE INDEX        IF NOT EXISTS sign_tags_org_idx           ON sign_tags(organisation_id);
