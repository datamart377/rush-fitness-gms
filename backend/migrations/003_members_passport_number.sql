-- Add an alternative ID for members:
--   passport_number — used when a member has no national ID (NIN)
-- Either national_id OR passport_number must be supplied (enforced at the
-- application layer for now to keep existing rows valid).
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS passport_number TEXT;

CREATE INDEX IF NOT EXISTS members_passport_idx ON members (passport_number);
