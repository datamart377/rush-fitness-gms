-- Allow walk-in guests in the attendance table.
--   • member_id becomes nullable (was NOT NULL referencing members)
--   • new walk_in_id column references walk_ins (set null on delete)
--   • new guest_name TEXT for display when there's no member record
--
-- A check constraint enforces that EITHER member_id OR walk_in_id is set
-- (so we never get an orphan attendance row with neither).

ALTER TABLE attendance
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS walk_in_id UUID REFERENCES walk_ins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Drop existing constraint if it exists (to allow re-running)
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_member_or_walkin_chk;
ALTER TABLE attendance
  ADD CONSTRAINT attendance_member_or_walkin_chk
    CHECK (member_id IS NOT NULL OR walk_in_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS attendance_walkin_idx ON attendance (walk_in_id);

-- Allow 'walkin' as a source value alongside staff/self/kiosk
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_source_check;
ALTER TABLE attendance
  ADD CONSTRAINT attendance_source_check
    CHECK (source IN ('staff','self','kiosk','walkin'));
