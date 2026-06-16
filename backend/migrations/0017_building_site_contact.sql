-- Buildings get a site address + an on-site point of contact, so contractors
-- know where to go and who to meet. Set per building, reused by every PPM/job
-- there. PPMs link to a building so the right details flow into the email.

ALTER TABLE buildings ADD COLUMN address             text;
ALTER TABLE buildings ADD COLUMN site_contact_name   text;
ALTER TABLE buildings ADD COLUMN site_contact_phone  text;
ALTER TABLE buildings ADD COLUMN site_contact_email  text;

ALTER TABLE ppms ADD COLUMN building_id uuid REFERENCES buildings(id) ON DELETE SET NULL;
