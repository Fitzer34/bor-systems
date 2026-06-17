-- Job-level tender by email: each invited contractor's quote gets a token
-- behind a no-login "submit your quote" magic link.

ALTER TABLE job_quotes ADD COLUMN token text;
CREATE UNIQUE INDEX job_quotes_token_idx ON job_quotes (token);
