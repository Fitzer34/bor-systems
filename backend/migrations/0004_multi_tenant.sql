-- Multi-tenant: every business that signs up gets its own isolated organisation.
-- Existing single-tenant data is migrated under a default "Main Organisation".

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organisations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Main Organisation');

-- USERS
ALTER TABLE users ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE users SET organisation_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE users ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX users_org_idx ON users(organisation_id);

-- Email is unique per-organisation now (not globally), so different orgs can have
-- their own admin@... etc. The old global unique index is replaced.
DROP INDEX users_email_unique;
CREATE UNIQUE INDEX users_org_email_unique ON users(organisation_id, email);

-- BUILDINGS
ALTER TABLE buildings ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE buildings SET organisation_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE buildings ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX buildings_org_idx ON buildings(organisation_id);

-- FLOORS (derive from building)
ALTER TABLE floors ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE floors SET organisation_id = (SELECT organisation_id FROM buildings WHERE buildings.id = floors.building_id);
ALTER TABLE floors ALTER COLUMN organisation_id SET NOT NULL;

-- ZONES (derive from floor)
ALTER TABLE zones ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE zones SET organisation_id = (SELECT organisation_id FROM floors WHERE floors.id = zones.floor_id);
ALTER TABLE zones ALTER COLUMN organisation_id SET NOT NULL;

-- HANGERS  (DevEUI is globally unique because it's a hardware identifier)
ALTER TABLE hangers ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE hangers SET organisation_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE hangers ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX hangers_org_idx ON hangers(organisation_id);

-- EVENTS (derive from hanger)
ALTER TABLE events ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE events SET organisation_id = (SELECT organisation_id FROM hangers WHERE hangers.id = events.hanger_id);
ALTER TABLE events ALTER COLUMN organisation_id SET NOT NULL;

-- ALERTS (derive from hanger)
ALTER TABLE alerts ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE alerts SET organisation_id = (SELECT organisation_id FROM hangers WHERE hangers.id = alerts.hanger_id);
ALTER TABLE alerts ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX alerts_org_status_idx ON alerts(organisation_id, status);

-- DISPATCHES (derive from recipient user)
ALTER TABLE dispatches ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE dispatches SET organisation_id = (SELECT organisation_id FROM users WHERE users.id = dispatches.recipient_user_id);
ALTER TABLE dispatches ALTER COLUMN organisation_id SET NOT NULL;

-- SHIFTS (derive from user)
ALTER TABLE shifts ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE shifts SET organisation_id = (SELECT organisation_id FROM users WHERE users.id = shifts.user_id);
ALTER TABLE shifts ALTER COLUMN organisation_id SET NOT NULL;

-- SETTINGS — composite key now (each org has its own settings)
ALTER TABLE settings ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE settings SET organisation_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE settings ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE settings DROP CONSTRAINT settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (organisation_id, key);

-- AUDIT LOG
ALTER TABLE audit_log ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE audit_log SET organisation_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE audit_log ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX audit_log_org_idx ON audit_log(organisation_id, at DESC);

-- NOTIFICATIONS (derive via user, fall back to alert -> hanger)
ALTER TABLE notifications ADD COLUMN organisation_id uuid REFERENCES organisations(id);
UPDATE notifications SET organisation_id = (SELECT organisation_id FROM users WHERE users.id = notifications.user_id);
UPDATE notifications SET organisation_id = (SELECT organisation_id FROM alerts WHERE alerts.id = notifications.alert_id) WHERE organisation_id IS NULL;
UPDATE notifications SET organisation_id = '00000000-0000-0000-0000-000000000001' WHERE organisation_id IS NULL;
ALTER TABLE notifications ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX notifications_org_idx ON notifications(organisation_id, sent_at DESC);
