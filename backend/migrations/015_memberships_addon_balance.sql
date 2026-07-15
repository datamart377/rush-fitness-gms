-- Adds a pre-paid ADD-ON wallet to memberships.
--
-- Members on any active plan EXCEPT pre-paid (which already covers add-ons
-- from its main wallet) can now load a UGX balance that gets consumed when
-- add-on activities are selected at check-in. The column exists on all
-- membership rows for schema symmetry, but the UI only exposes the top-up
-- action on eligible plans (see App.jsx Memberships row).
--
-- Wallet mutation is owned by the payments route:
--   • payments.type = 'addon_topup'  → memberships.addon_balance += amount
--     (real money collected — recorded as a payment for the audit trail; does
--      NOT bump memberships.total_paid, which is scoped to the base plan)
--   • payments.type = 'addon_debit'  → memberships.addon_balance -= amount
--     (wallet consumption at check-in; the payment row is the debit ledger
--      entry, amount here is the wallet amount consumed and is NOT counted
--      as cash-in on revenue reports)
--
-- The payments.type CHECK constraint is extended to include the two new
-- values. GREATEST(0, ...) in the payments handler guards against a debit
-- ever driving the balance below zero even if a race occurs between the
-- balance-check and the debit itself.

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS addon_balance INTEGER NOT NULL DEFAULT 0;

-- Expand the payments.type CHECK constraint. Postgres doesn't allow ALTER
-- CONSTRAINT to change the expression, so we drop-and-recreate. The DROP
-- is guarded by IF EXISTS in case an earlier migration already renamed it.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_type_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_type_check
  CHECK (type IN ('membership','addon','addon_topup','addon_debit','walk_in','product','other'));
