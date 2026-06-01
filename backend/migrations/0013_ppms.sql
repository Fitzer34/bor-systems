-- BOR Systems — Planned Preventive Maintenance (PPM) tasks.
--
-- Recurring maintenance jobs a facilities manager schedules with outside
-- contractors (fire-extinguisher service, PAT testing, HVAC filter changes,
-- legionella checks...). The PPM reminder job (services/ppm-reminder.ts)
-- emails the org's admins + supervisors as each task's due date approaches,
-- and the dashboard surfaces due/overdue badges + a login banner.
--
-- Frequency is stored as "times per year" so the next due date can roll
-- forward automatically when a task is marked complete.

CREATE TABLE IF NOT EXISTS ppms (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    -- What needs doing.
    title                text NOT NULL,
    -- Optional scope / detail notes.
    notes                text,
    -- Contractor who performs the work + how to reach them.
    contractor_name      text,
    contact_phone        text,
    contact_email        text,
    -- Times per year (1 = annual, 4 = quarterly, 12 = monthly).
    frequency_per_year   integer NOT NULL DEFAULT 1,
    -- When next due (calendar date, no time-of-day).
    next_due_date        date NOT NULL,
    -- Days before next_due_date the first reminder fires (editable per task).
    reminder_lead_days   integer NOT NULL DEFAULT 14,
    -- Set when last marked complete; next due rolls forward from here.
    last_completed_at    timestamptz,
    -- Dedup guard — at most one reminder email per calendar day per task.
    last_reminded_on     date,
    -- Paused tasks stay listed but stop generating reminders.
    active               boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Org-scoped lookups (every dashboard list filters by current org).
CREATE INDEX IF NOT EXISTS ppms_org_idx ON ppms (organisation_id);
-- The reminder job scans by due date.
CREATE INDEX IF NOT EXISTS ppms_due_idx ON ppms (next_due_date);
