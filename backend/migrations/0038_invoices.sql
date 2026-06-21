-- Invoices.
--
-- A lightweight billing record per organisation: a numbered invoice raised
-- against a customer, optionally linked to a building and/or a maintenance job.
-- Money is stored in minor units (amount_cents) to avoid float rounding.
--
-- Lifecycle (status): draft → sent → paid, with overdue / void as side states.
-- The daily reminder tick flips a 'sent' invoice past its due_at (and not paid)
-- to 'overdue' and notifies admins/supervisors (invoice.overdue). Additive +
-- idempotent (CREATE … IF NOT EXISTS) so a re-run is a no-op.
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  number          text NOT NULL,                         -- e.g. 'INV-2050'
  customer_name   text,
  building_id     uuid REFERENCES buildings(id) ON DELETE SET NULL,
  job_id          uuid REFERENCES maintenance_jobs(id) ON DELETE SET NULL,
  amount_cents    integer NOT NULL DEFAULT 0,            -- minor units
  currency        text NOT NULL DEFAULT 'EUR',
  status          text NOT NULL DEFAULT 'draft',         -- draft|sent|paid|overdue|void
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_org_status_idx ON invoices (organisation_id, status);
CREATE INDEX IF NOT EXISTS invoices_org_due_idx    ON invoices (organisation_id, due_at);
