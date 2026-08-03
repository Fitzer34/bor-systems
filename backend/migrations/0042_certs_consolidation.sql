-- Consolidate staff certifications onto ONE table.
--
-- 0041 added a second cert table (staff_certs) while staff_certifications
-- already existed, already had /certifications routes, and is already watched
-- by the daily reminder job. Keep the original as the single source of truth:
-- give it the two columns the new Competency UI needs, defensively copy any
-- rows out of staff_certs (created hours earlier, empty in production), then
-- drop the duplicate. Additive + idempotent.
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE staff_certifications ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff_certs') THEN
    INSERT INTO staff_certifications
      (organisation_id, user_id, name, issuer, reference, issued_on, expires_on, document_url, created_by, created_at)
    SELECT organisation_id, user_id, name, issuer, cert_no, issued_on, expires_on, document_url, created_by, created_at
    FROM staff_certs;
    DROP TABLE staff_certs;
  END IF;
END $$;
