-- Walk-ins need to capture safety information for non-members at the gym.
-- The Add Walk-In modal has been collecting Emergency Contact 1, Emergency
-- Contact 2, and Gender for some time, but the backend silently dropped them
-- because the columns didn't exist and the route whitelist excluded them.
-- This migration plugs that hole.
--
-- Also adds emergency_name to mirror the members schema, since the form may
-- eventually capture the contact person's name (members already has it).
--
-- Idempotent: every column is ADD COLUMN IF NOT EXISTS.

ALTER TABLE walk_ins
  ADD COLUMN IF NOT EXISTS gender            TEXT,
  ADD COLUMN IF NOT EXISTS emergency_name    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone_2 TEXT;

-- Optional gender check, kept permissive to match members (Male/Female/Other).
-- Not enforced as a constraint because legacy rows are NULL and we don't want
-- to block existing data; the API validator handles the allowed set.
