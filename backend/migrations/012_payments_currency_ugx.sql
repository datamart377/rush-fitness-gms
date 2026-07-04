-- Rush Fitness operates in Uganda — all money is Uganda Shillings (UGX).
-- Migration 001 originally set the payments.currency default to 'KES' (a
-- carryover from the initial schema template). This migration flips the
-- column default to 'UGX' and rewrites any existing rows still stamped
-- 'KES' so historical reports, receipts, and the reconciliation view all
-- report the correct currency code.
--
-- Idempotent: re-running is a no-op once every row is 'UGX' and the
-- default has been changed.

ALTER TABLE payments
  ALTER COLUMN currency SET DEFAULT 'UGX';

UPDATE payments
   SET currency = 'UGX'
 WHERE currency = 'KES';
