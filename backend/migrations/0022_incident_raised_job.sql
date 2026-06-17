-- Cross-discipline bridge: a security incident can be turned into a maintenance
-- job. Track which job it raised.

ALTER TABLE security_incidents
  ADD COLUMN raised_job_id uuid REFERENCES maintenance_jobs(id) ON DELETE SET NULL;
