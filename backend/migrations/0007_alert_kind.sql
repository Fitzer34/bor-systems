-- Differentiate spill alerts from planned cleaning sessions.
-- Both render as blue pins on the floor plan, but only spills should
-- appear in the Active alerts list. The button on the hanger creates
-- `planned_cleaning` alerts; a lifted-sign event without a button press
-- creates `spill` alerts (the historic default).

CREATE TYPE alert_kind AS ENUM ('spill', 'planned_cleaning');

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS kind alert_kind NOT NULL DEFAULT 'spill';
