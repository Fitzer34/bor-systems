-- Cleaning quality inspections: a scored checklist per walk-through. A deficient
-- item can spawn a maintenance/cleaning work order.

CREATE TYPE inspection_rating AS ENUM ('meets', 'acceptable', 'needs_improvement', 'na');

CREATE TABLE inspections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id        uuid REFERENCES buildings(id) ON DELETE SET NULL,
  area               text,
  inspector_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  inspector_name     text,
  score              integer,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspections_org_idx      ON inspections (organisation_id);
CREATE INDEX inspections_building_idx ON inspections (building_id);

CREATE TABLE inspection_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  inspection_id    uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  label            text NOT NULL,
  rating           inspection_rating NOT NULL DEFAULT 'meets',
  note             text,
  photo_url        text,
  raised_job_id    uuid REFERENCES maintenance_jobs(id) ON DELETE SET NULL
);
CREATE INDEX inspection_items_inspection_idx ON inspection_items (inspection_id);
