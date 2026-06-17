-- Staff invite onboarding.
--
-- Admins can now add a staff member and have the platform email them a secure
-- one-time invite link instead of hand-delivering a password. Clicking the link
-- lets the new hire set their own password and drops them straight into the app,
-- already logged in.
--
-- These nullable columns hold the pending-invite state on the user row. Only the
-- SHA-256 of the token is stored (never the token itself), so a database leak
-- can't be used to accept an invite or take over a pending account. Additive +
-- idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at  timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at         timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz;

-- Token lookups hit this on every accept-invite page load + submit.
CREATE INDEX IF NOT EXISTS users_invite_token_hash ON users (invite_token_hash);
