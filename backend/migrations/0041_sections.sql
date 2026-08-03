-- Seven operational systems that previously had no backend at all:
-- timesheets (time & attendance), compliance register, permits to work,
-- SLA policies, form templates + submissions, client portals, staff certs.
-- Additive + idempotent.

-- ── Time & attendance ────────────────────────────────────────────────
-- One row per clock-in. status: open (still clocked in) → pending (clocked
-- out, awaiting approval) → approved. Admin manual entries start pending.
CREATE TABLE IF NOT EXISTS time_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_id     uuid REFERENCES buildings(id) ON DELETE SET NULL,
  clock_in_at     timestamptz NOT NULL,
  clock_out_at    timestamptz,
  break_minutes   integer NOT NULL DEFAULT 0,
  source          text NOT NULL DEFAULT 'web',   -- web|mobile|kiosk|manual
  status          text NOT NULL DEFAULT 'open',  -- open|pending|approved
  note            text,
  edited_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_entries_org_in_idx ON time_entries (organisation_id, clock_in_at);
CREATE INDEX IF NOT EXISTS time_entries_user_idx   ON time_entries (user_id);

-- ── Statutory compliance register ────────────────────────────────────
-- Fire alarm service, EICR, gas cert, TMV/legionella, lift LOLER, etc.
-- Status is derived from next_due_on (overdue / due soon / ok).
CREATE TABLE IF NOT EXISTS compliance_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id      uuid REFERENCES buildings(id) ON DELETE SET NULL,
  name             text NOT NULL,
  category         text NOT NULL DEFAULT 'other',  -- fire|electrical|gas|water|lifts|hvac|other
  frequency_months integer NOT NULL DEFAULT 12,
  last_done_on     date,
  next_due_on      date,
  contractor_id    uuid REFERENCES contractors(id) ON DELETE SET NULL,
  document_url     text,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_org_due_idx ON compliance_items (organisation_id, next_due_on);

-- ── Permits to work ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id     uuid REFERENCES buildings(id) ON DELETE SET NULL,
  job_id          uuid REFERENCES maintenance_jobs(id) ON DELETE SET NULL,
  type            text NOT NULL DEFAULT 'general', -- hot_works|working_at_height|confined_space|electrical|asbestos|excavation|general
  contractor_id   uuid REFERENCES contractors(id) ON DELETE SET NULL,
  contractor_name text,
  description     text NOT NULL,
  requirements    jsonb NOT NULL DEFAULT '[]',     -- checklist acknowledged at approval
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'requested', -- requested|approved|active|closed|rejected|cancelled
  requested_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  closed_at       timestamptz,
  closed_note     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permits_org_status_idx ON permits (organisation_id, status);

-- ── SLA policies ─────────────────────────────────────────────────────
-- Response/resolve targets per job priority; compliance is computed from
-- maintenance_jobs + job_events at read time.
CREATE TABLE IF NOT EXISTS sla_policies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  priority         text NOT NULL,                  -- emergency|urgent|routine
  response_minutes integer NOT NULL,
  resolve_minutes  integer NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sla_org_priority_idx ON sla_policies (organisation_id, priority);

-- ── Forms (templates + submissions) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS form_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  fields          jsonb NOT NULL DEFAULT '[]',     -- [{id,label,type,required,options}]
  active          boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_templates_org_idx ON form_templates (organisation_id);

CREATE TABLE IF NOT EXISTS form_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  building_id     uuid REFERENCES buildings(id) ON DELETE SET NULL,
  submitted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  answers         jsonb NOT NULL DEFAULT '{}',     -- {fieldId: value}
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_submissions_tpl_idx ON form_submissions (template_id, created_at);

-- ── Client portals ───────────────────────────────────────────────────
-- Unguessable token behind a client's no-login, read-only site view +
-- "raise a request" form. Revoke = set revoked_at.
CREATE TABLE IF NOT EXISTS client_portals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  building_id     uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  client_name     text NOT NULL,
  email           text,
  token           text NOT NULL,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS client_portals_token_idx ON client_portals (token);
CREATE INDEX IF NOT EXISTS client_portals_org_idx ON client_portals (organisation_id);

-- Jobs raised from a client portal get their own source value.
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'portal';

-- ── Staff certifications (competency) ────────────────────────────────
-- SafePass, Manual Handling, First Aid, etc. Status derived from expires_on.
CREATE TABLE IF NOT EXISTS staff_certs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  issuer          text,
  cert_no         text,
  issued_on       date,
  expires_on      date,
  document_url    text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_certs_user_idx ON staff_certs (user_id);
CREATE INDEX IF NOT EXISTS staff_certs_org_exp_idx ON staff_certs (organisation_id, expires_on);
