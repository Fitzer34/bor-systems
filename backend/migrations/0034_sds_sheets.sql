-- Safety Data Sheets (SDS): a per-org library of chemical/product safety sheets,
-- filed by discipline (cleaning / maintenance / security). A product is found by
-- scanning its barcode; if it isn't in the library yet, its SDS document is
-- uploaded and the listed hazards + components are extracted from THAT document
-- (and human-verified) — never invented. A free barcode product-identity lookup
-- and an optional paid SDS-database provider may pre-fill fields, but the
-- authoritative record is the uploaded sheet that a person confirms.

CREATE TYPE sds_discipline AS ENUM ('cleaning', 'maintenance', 'security', 'general');
CREATE TYPE sds_source AS ENUM ('ai_extraction', 'manual', 'provider');

CREATE TABLE sds_sheets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  discipline               sds_discipline NOT NULL DEFAULT 'general',
  building_id              uuid REFERENCES buildings(id) ON DELETE SET NULL,
  barcode                  text,
  product_name             text NOT NULL,
  manufacturer             text,
  product_code             text,
  signal_word              text,
  pictograms               jsonb NOT NULL DEFAULT '[]'::jsonb,
  hazard_statements        jsonb NOT NULL DEFAULT '[]'::jsonb,
  precautionary_statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ingredients              jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_aid                text,
  storage_handling         text,
  ppe                      text,
  sds_pdf_url              text,
  issue_date               date,
  revision_date            date,
  review_date              date,
  source                   sds_source NOT NULL DEFAULT 'manual',
  extraction_warnings      jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified                 boolean NOT NULL DEFAULT false,
  verified_by_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at              timestamptz,
  created_by_user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sds_sheets_org_idx         ON sds_sheets (organisation_id);
CREATE INDEX sds_sheets_org_barcode_idx ON sds_sheets (organisation_id, barcode);
CREATE INDEX sds_sheets_org_disc_idx    ON sds_sheets (organisation_id, discipline);
