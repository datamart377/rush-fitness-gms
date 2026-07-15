-- Adds an optional `member_id` FK on walk_ins so a walk-in row can be linked
-- back to a registered member. Used when a member's pre-paid membership
-- balance runs below the daily rate and staff opts to check them in as a
-- walk-in rather than turn them away — the walk-in still gets recorded
-- against the member for history / reporting purposes.
--
-- ON DELETE SET NULL keeps historical walk-in records intact if the member
-- profile is ever deleted (matches the pattern used for payments.member_id
-- and attendance.member_id in earlier migrations).
ALTER TABLE walk_ins
  ADD COLUMN IF NOT EXISTS member_id UUID
    REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS walk_ins_member_idx
  ON walk_ins (member_id)
  WHERE member_id IS NOT NULL;
