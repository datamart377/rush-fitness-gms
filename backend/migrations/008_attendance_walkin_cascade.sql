-- Walk-in deletes were failing with "value violates a check constraint".
--
-- Root cause: migration 004 added attendance.walk_in_id as
--   REFERENCES walk_ins(id) ON DELETE SET NULL
-- alongside a CHECK constraint
--   CHECK (member_id IS NOT NULL OR walk_in_id IS NOT NULL).
--
-- For walk-in-originated attendance rows member_id is also NULL, so
-- when a walk-in was deleted the cascade tried to NULL out walk_in_id,
-- which left both columns NULL and the check rejected the update —
-- aborting the parent DELETE.
--
-- Fix: change the FK to ON DELETE CASCADE so that an attendance row for
-- a deleted walk-in guest is removed together with its parent. The row
-- is meaningless on its own (no member, no guest), and deleting it
-- preserves the invariant that the check constraint guarantees.
--
-- Members keep their existing FK behaviour — those rows are rarely
-- hard-deleted in practice and we want historical attendance to remain
-- visible if someone disappears from the members table.
--
-- The FK created by migration 004 has a system-generated name (the
-- column was added inline). We locate it dynamically by inspecting
-- pg_constraint, then drop and re-add with the correct cascade.
-- Idempotent: if the constraint is already missing we skip the DROP,
-- and the new constraint is named explicitly so this migration is safe
-- to re-run.

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'attendance'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) LIKE '%walk_in_id%REFERENCES walk_ins%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE attendance DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_walk_in_fk;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_walk_in_fk
    FOREIGN KEY (walk_in_id) REFERENCES walk_ins(id) ON DELETE CASCADE;
