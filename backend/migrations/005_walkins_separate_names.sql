-- Walk-ins were storing one merged `full_name`. The UI splits this into
-- "Surname" (last_name) and "Other Name(s)" (first_name) — so we add separate
-- columns and backfill from the existing data.

ALTER TABLE walk_ins
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill: best-effort split on the LAST space.
--   "Mary Jane Smith" → first_name="Mary Jane", last_name="Smith"
--   "Madonna"         → first_name=NULL,        last_name="Madonna"
UPDATE walk_ins
SET
  first_name = CASE
    WHEN position(' ' IN full_name) > 0
      THEN trim(BOTH FROM substring(full_name FROM 1 FOR length(full_name) - position(' ' IN reverse(full_name))))
    ELSE NULL
  END,
  last_name  = CASE
    WHEN position(' ' IN full_name) > 0
      THEN trim(BOTH FROM substring(full_name FROM length(full_name) - position(' ' IN reverse(full_name)) + 2))
    ELSE full_name
  END
WHERE first_name IS NULL AND last_name IS NULL AND full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS walk_ins_name_idx ON walk_ins (last_name, first_name);
