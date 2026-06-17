-- Security: guard-tour checkpoints + patrol scan log.

CREATE TABLE checkpoints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id      uuid REFERENCES buildings(id) ON DELETE SET NULL,
  name             text NOT NULL,
  location_note    text,
  instructions     text,
  token            text NOT NULL UNIQUE,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkpoints_org_idx      ON checkpoints (organisation_id);
CREATE INDEX checkpoints_building_idx ON checkpoints (building_id);

CREATE TABLE checkpoint_scans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  checkpoint_id    uuid NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  guard_name       text,
  note             text,
  flagged          boolean NOT NULL DEFAULT false,
  scanned_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkpoint_scans_cp_idx  ON checkpoint_scans (checkpoint_id);
CREATE INDEX checkpoint_scans_org_idx ON checkpoint_scans (organisation_id);
