-- Fix the type of memberships.addon_balance.
--
-- Migration 015 created addon_balance as INTEGER. That was wrong: the
-- payments route runs
--   UPDATE memberships SET addon_balance = addon_balance + $1 ...
-- with $1 = payment.amount, which node-postgres returns as a *string*
-- like "50000.00" (because NUMERIC(12,2) is serialised as text by default).
-- Postgres then tries to cast "50000.00" into INTEGER and dies with
--   ERROR: invalid input syntax for type integer: "50000.00"   (SQLSTATE 22P02)
-- The user saw this as the generic "Invalid identifier or value format"
-- from the error handler.
--
-- Fix: switch the column to NUMERIC(12,2) so it matches payments.amount
-- (and mirrors memberships.total_paid, which never had this problem for
-- the same reason). The USING clause is a no-op for existing INTEGER
-- values but makes the ALTER idempotent if this ever runs against an
-- already-NUMERIC column.

ALTER TABLE memberships
  ALTER COLUMN addon_balance TYPE NUMERIC(12,2) USING addon_balance::numeric;
