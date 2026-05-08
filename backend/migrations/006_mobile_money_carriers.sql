-- Split mobile-money into MTN and Airtel carriers.
--
-- Existing payments recorded as 'mpesa' have no carrier info attached, so we
-- leave them as 'mpesa' (legacy/unspecified) and let the UI label them just
-- "Mobile Money". New payments will use 'mpesa_mtn' or 'mpesa_airtel'.
--
-- Idempotent: drops the prior CHECK by its conventional name and adds the new
-- one. If the constraint name differs in some environment, run:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'payments'::regclass;
-- and adjust the DROP CONSTRAINT line.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;

ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'mpesa', 'mpesa_mtn', 'mpesa_airtel', 'card', 'bank_transfer'));
