-- Add validity-window + usage-cap columns to discounts.
--
-- The frontend already shows Start Date / End Date / Max Uses inputs in the
-- Create/Edit Discount modal, but the original schema in 001 only had
-- code/description/type/value/is_active. Result: those inputs were
-- cosmetic — values were silently dropped by pickFields() in crud.js
-- because the column names weren't in the route's allowed-fields list.
--
-- This migration adds the three missing columns plus a uses_count
-- counter so the existing USES column ("0/0") in the UI starts working
-- once the redemption code is wired up. None of the columns are
-- mandatory — pre-existing discount rows are left with NULL windows
-- (interpreted as "always valid") and 0 redemptions, matching the
-- behaviour the UI showed before.
--
-- Idempotent: each ADD COLUMN uses IF NOT EXISTS so re-running the
-- migration is safe.

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS valid_from  DATE,
  ADD COLUMN IF NOT EXISTS valid_to    DATE,
  ADD COLUMN IF NOT EXISTS max_uses    INTEGER,
  ADD COLUMN IF NOT EXISTS uses_count  INTEGER NOT NULL DEFAULT 0;

-- Defensive integrity: a discount can't end before it starts, and the
-- usage counter shouldn't go negative. Both constraints are skipped on
-- re-run.
ALTER TABLE discounts
  DROP CONSTRAINT IF EXISTS discounts_validity_chk;
ALTER TABLE discounts
  ADD CONSTRAINT discounts_validity_chk
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from);

ALTER TABLE discounts
  DROP CONSTRAINT IF EXISTS discounts_uses_chk;
ALTER TABLE discounts
  ADD CONSTRAINT discounts_uses_chk
    CHECK (uses_count >= 0 AND (max_uses IS NULL OR max_uses >= 0));
