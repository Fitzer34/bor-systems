-- BOR Systems — gateways table.
--
-- A gateway is the mains-powered Heltec V3 (or similar) box installed in a
-- customer building. It listens for LoRa packets from nearby hangers and
-- forwards them to /webhook/tts over WiFi. Unlike hangers, gateways
-- self-register on boot — the customer never types a DevEUI; the device
-- introduces itself the first time it joins WiFi.
--
-- The dashboard's Manage → Gateways view reads from here so admins can
-- see which gateways are online, which building each lives in, and what
-- firmware version they're running.

CREATE TABLE IF NOT EXISTS gateways (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    dev_eui              text NOT NULL,
    name                 text,
    building_id          uuid REFERENCES buildings(id) ON DELETE SET NULL,
    -- Last-known network state, refreshed on every heartbeat from the device.
    ip_address           text,
    ssid                 text,
    rssi                 smallint,
    firmware_version     text,
    packets_forwarded    integer NOT NULL DEFAULT 0,
    uptime_sec           integer,
    last_seen_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now()
);

-- DevEUI is the device's hardware identity, must be globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS gateways_dev_eui_unique ON gateways (dev_eui);

-- Org-scoped lookups (the dashboard filters every list by current org).
CREATE INDEX IF NOT EXISTS gateways_org_idx ON gateways (organisation_id);
