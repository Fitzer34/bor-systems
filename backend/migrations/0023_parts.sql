-- CMMS inventory: spare-parts catalogue + stock levels.

CREATE TABLE parts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  sku              text,
  unit             text NOT NULL DEFAULT 'each',
  stock_qty        integer NOT NULL DEFAULT 0,
  reorder_level    integer NOT NULL DEFAULT 0,
  unit_cost_cents  integer,
  supplier         text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parts_org_idx ON parts (organisation_id);
