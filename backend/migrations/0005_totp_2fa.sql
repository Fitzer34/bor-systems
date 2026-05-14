-- Two-factor authentication (TOTP, RFC 6238) for any user, opt-in.
-- Strongly recommended for admin accounts; the web app enforces it for them.
--
-- totp_secret           Base32 secret, set once enrolment is committed.
-- totp_pending_secret   Base32 secret while the user is still in the
--                       "scan-this-QR-code-and-prove-it-works" flow. Cleared
--                       when promoted to totp_secret, so a half-finished
--                       enrolment can never lock anyone out.
-- totp_enrolled_at      Timestamp when totp_secret was committed.
-- recovery_codes        JSON array of argon2-hashed single-use recovery codes,
--                       so a user who loses their authenticator app can still
--                       sign in.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret text,
  ADD COLUMN IF NOT EXISTS totp_pending_secret text,
  ADD COLUMN IF NOT EXISTS totp_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_codes jsonb;
