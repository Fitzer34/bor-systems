-- Adds a new event_type for when a cleaner presses the physical
-- "I'm cleaning" button on the hanger. The webhook handler maps this
-- to acknowledging the open alert for that hanger.

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'cleaning_started';
