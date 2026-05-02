-- Walk-ins were storing the surname + other names concatenated into full_name.
-- Add separate columns so the table view can render them in their own cells.
-- Existing rows are backfilled by splitting full_name at the first whitespace
-- (left = first_name / other names, right = last_name / surname). This matches
-- what the original UI form did when concatenating: `${firstName} ${lastName}`.

ALTER TABLE walk_ins
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill: split full_name on first whitespace.
-- Anything before the first space → first_name; anything after → last_name.
-- Single-word names go into first_name; last_name stays NULL.
UPDATE walk_ins
   SET first_name = COALESCE(first_name, split_part(full_name, ' ', 1)),
       last_name  = COALESCE(last_name,
                             NULLIF(regexp_replace(full_name, '^\S+\s*', ''), ''))
 WHERE first_name IS NULL OR last_name IS NULL;
