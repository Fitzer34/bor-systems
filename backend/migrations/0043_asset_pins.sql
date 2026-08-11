-- Asset pin on the floor plan: fractional position (0..1) of the pin on the
-- floor's plan image. Lets the contractor magic-link page show exactly where
-- the faulty asset is. Additive + idempotent. Feature flags need no schema —
-- they live in the settings key-value table under key 'features'.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pos_x real;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pos_y real;
