-- Split checkpoints by discipline: Cleaning rounds vs Security patrols.
--
-- A checkpoint was originally a guard-tour point (Security). The cleaning side
-- reused the same list, which mixed the two. This tags each checkpoint with the
-- discipline it belongs to so each section shows only its own — cleaners see
-- cleaning rounds, guards see security patrols.
--
-- Existing rows default to 'security' (they were built as guard checkpoints,
-- see migration 0099 / task #99). Additive + idempotent.
DO $$ BEGIN
  CREATE TYPE checkpoint_discipline AS ENUM ('cleaning', 'security');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE checkpoints
  ADD COLUMN IF NOT EXISTS discipline checkpoint_discipline NOT NULL DEFAULT 'security';

CREATE INDEX IF NOT EXISTS checkpoints_discipline_idx ON checkpoints (organisation_id, discipline);
