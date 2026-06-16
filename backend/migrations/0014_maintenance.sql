-- HazardLink — Maintenance & tendering platform (Phase 1).
--
-- Extends the existing site model (organisations → buildings → floors → zones),
-- users and ppms. Contractors are NOT app users — they're emailed (white-labelled
-- as the maintenance company) and respond via magic links.
-- See docs/MAINTENANCE_PLATFORM_SPEC.md.

CREATE TYPE job_source AS ENUM ('manual', 'sensor', 'ppm', 'tenant_request');
CREATE TYPE job_priority AS ENUM ('emergency', 'urgent', 'routine');
CREATE TYPE job_status AS ENUM (
    'logged', 'scoped', 'tendering', 'awarded', 'scheduled',
    'in_progress', 'completed', 'cancelled'
);
CREATE TYPE bill_to_party AS ENUM ('landlord', 'tenant', 'maintenance_co');
CREATE TYPE quote_status AS ENUM ('pending', 'submitted', 'awarded', 'declined', 'withdrawn');
CREATE TYPE contractor_tier AS ENUM ('preferred', 'approved', 'on_notice', 'blocked');

-- Trade taxonomy. Built-ins seed with organisation_id NULL; org customs set it.
CREATE TABLE IF NOT EXISTS trades (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    group_name      text NOT NULL,
    statutory       boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trades_org_idx ON trades(organisation_id);

CREATE TABLE IF NOT EXISTS assets (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    building_id            uuid REFERENCES buildings(id) ON DELETE SET NULL,
    floor_id               uuid REFERENCES floors(id) ON DELETE SET NULL,
    zone_id                uuid REFERENCES zones(id) ON DELETE SET NULL,
    trade_id               uuid REFERENCES trades(id) ON DELETE SET NULL,
    name                   text NOT NULL,
    category               text,
    make                   text,
    model                  text,
    serial                 text,
    qr_code                text,
    install_date           date,
    expected_life_years    smallint,
    warranty_expiry        date,
    condition_score        smallint,
    purchase_cost_cents    integer,
    replacement_cost_cents integer,
    notes                  text,
    retired                boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_org_idx ON assets(organisation_id);
CREATE INDEX IF NOT EXISTS assets_building_idx ON assets(building_id);

CREATE TABLE IF NOT EXISTS contractors (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name             text NOT NULL,
    contact_name     text,
    email            text,
    phone            text,
    region           text,
    insurance_expiry date,
    accreditation    text,
    is_preferred     boolean NOT NULL DEFAULT false,
    tier             contractor_tier NOT NULL DEFAULT 'approved',
    rating_avg       smallint,
    notes            text,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractors_org_idx ON contractors(organisation_id);

CREATE TABLE IF NOT EXISTS contractor_trades (
    contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    trade_id      uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    PRIMARY KEY (contractor_id, trade_id)
);

CREATE TABLE IF NOT EXISTS tenants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    building_id     uuid REFERENCES buildings(id) ON DELETE SET NULL,
    name            text NOT NULL,
    contact_name    text,
    email           text,
    phone           text,
    area_note       text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenants_org_idx ON tenants(organisation_id);

-- The job spine. One row per piece of maintenance work, reactive or planned.
CREATE TABLE IF NOT EXISTS maintenance_jobs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    source               job_source NOT NULL DEFAULT 'manual',
    building_id          uuid REFERENCES buildings(id) ON DELETE SET NULL,
    floor_id             uuid REFERENCES floors(id) ON DELETE SET NULL,
    zone_id              uuid REFERENCES zones(id) ON DELETE SET NULL,
    asset_id             uuid REFERENCES assets(id) ON DELETE SET NULL,
    trade_id             uuid REFERENCES trades(id) ON DELETE SET NULL,
    title                text NOT NULL,
    description          text,
    scope                text,
    priority             job_priority NOT NULL DEFAULT 'routine',
    status               job_status NOT NULL DEFAULT 'logged',
    bill_to              bill_to_party,
    tenant_id            uuid REFERENCES tenants(id) ON DELETE SET NULL,
    reported_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
    ppm_id               uuid REFERENCES ppms(id) ON DELETE SET NULL,
    awarded_quote_id     uuid,  -- → job_quotes.id (no FK constraint: avoids a cycle)
    award_reason         text,
    proposed_start_at    timestamptz,
    scheduled_start_at   timestamptz,
    scheduled_end_at     timestamptz,
    completed_at         timestamptz,
    completion_note      text,
    completion_photo_url text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_jobs_org_idx ON maintenance_jobs(organisation_id);
CREATE INDEX IF NOT EXISTS maintenance_jobs_status_idx ON maintenance_jobs(status);
CREATE INDEX IF NOT EXISTS maintenance_jobs_asset_idx ON maintenance_jobs(asset_id);

-- One row per contractor invited to a job's tender (and their quote, once given).
CREATE TABLE IF NOT EXISTS job_quotes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              uuid NOT NULL REFERENCES maintenance_jobs(id) ON DELETE CASCADE,
    organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    contractor_id       uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    status              quote_status NOT NULL DEFAULT 'pending',
    amount_cents        integer,
    upfront_cents       integer,
    upfront_pct         smallint,
    proposed_start_date date,
    notes               text,
    invited_at          timestamptz NOT NULL DEFAULT now(),
    submitted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS job_quotes_job_idx ON job_quotes(job_id);
CREATE INDEX IF NOT EXISTS job_quotes_contractor_idx ON job_quotes(contractor_id);

-- Append-only timeline / audit trail per job.
CREATE TABLE IF NOT EXISTS job_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          uuid NOT NULL REFERENCES maintenance_jobs(id) ON DELETE CASCADE,
    organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    type            text NOT NULL,
    actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
    detail          text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events(job_id);
