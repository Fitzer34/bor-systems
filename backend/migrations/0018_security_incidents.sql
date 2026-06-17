-- Security section: incident reporting. Incidents logged on site by guards/staff,
-- tied to a building so Security shares the site model with cleaning + maintenance.

CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE incident_status   AS ENUM ('open', 'investigating', 'resolved');

CREATE TABLE security_incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id         uuid REFERENCES buildings(id) ON DELETE SET NULL,
  reported_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind                text,
  severity            incident_severity NOT NULL DEFAULT 'medium',
  status              incident_status   NOT NULL DEFAULT 'open',
  title               text NOT NULL,
  description         text,
  photo_url           text,
  occurred_at         timestamptz,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incidents_org_idx      ON security_incidents (organisation_id);
CREATE INDEX incidents_building_idx ON security_incidents (building_id);
