CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'cleaner');
CREATE TYPE hanger_status AS ENUM ('active', 'out_of_service', 'decommissioned');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'closed');
CREATE TYPE closure_reason AS ENUM ('sign_returned', 'sign_damaged', 'sign_missing', 'manual');
CREATE TYPE event_type AS ENUM ('lifted', 'returned', 'heartbeat', 'low_battery');
CREATE TYPE notification_channel AS ENUM ('push', 'sms', 'email');
CREATE TYPE notification_kind AS ENUM ('alert', 'rebroadcast', 'escalation', 'low_battery', 'sign_replacement_needed');

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL,
  floor_plan_url text
);
CREATE INDEX floors_building_idx ON floors(building_id);

CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name text NOT NULL,
  pin_x integer,
  pin_y integer
);
CREATE INDEX zones_floor_idx ON zones(floor_id);

CREATE TABLE hangers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dev_eui text NOT NULL,
  app_eui text,
  app_key text,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  status hanger_status NOT NULL DEFAULT 'active',
  audible_alarm_enabled boolean NOT NULL DEFAULT false,
  battery_pct smallint,
  firmware_version text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hangers_dev_eui_unique ON hangers(dev_eui);
CREATE INDEX hangers_zone_idx ON hangers(zone_id);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanger_id uuid NOT NULL REFERENCES hangers(id) ON DELETE CASCADE,
  type event_type NOT NULL,
  battery_pct smallint,
  raw_payload text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_hanger_idx ON events(hanger_id, received_at);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL,
  on_duty boolean NOT NULL DEFAULT false,
  push_token text,
  phone_e164 text,
  locale text NOT NULL DEFAULT 'en-GB',
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX users_email_unique ON users(email);

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanger_id uuid NOT NULL REFERENCES hangers(id) ON DELETE RESTRICT,
  status alert_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rebroadcast_count integer NOT NULL DEFAULT 0,
  escalated_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  closure_reason closure_reason,
  closure_note text
);
CREATE INDEX alerts_status_idx ON alerts(status);
CREATE INDEX alerts_hanger_idx ON alerts(hanger_id, opened_at);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid REFERENCES alerts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  channel notification_channel NOT NULL,
  kind notification_kind NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered boolean,
  error text
);
CREATE INDEX notifications_alert_idx ON notifications(alert_id);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
