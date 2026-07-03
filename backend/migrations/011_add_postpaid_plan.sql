-- Adds "Post-Paid" as a new plans.category and seeds the Post-Paid plan row.
--
-- Post-paid mirrors Pre-Paid structurally (fixed # of visits at a per-visit
-- rate) but flips the payment: the member accrues an outstanding tab as they
-- check in and settles the whole amount later. No cap is enforced at check-in
-- (per operator preference — every visit gets recorded regardless of balance).
--
-- Category is stored distinct from 'prepaid' so reports and future queries can
-- tell the two apart without pattern-matching on the plan code.
--
-- Idempotent enough for reruns: DO $$…$$ guards the constraint swap and the
-- seed row uses ON CONFLICT (code) DO NOTHING.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'plans'::regclass
       AND conname  = 'plans_category_check'
  ) THEN
    ALTER TABLE plans DROP CONSTRAINT plans_category_check;
  END IF;
END $$;

ALTER TABLE plans
  ADD CONSTRAINT plans_category_check
  CHECK (category IN ('gym','combo','prepaid','postpaid','group'));

INSERT INTO plans (code, name, category, price, duration_days, group_size, daily_rate)
VALUES ('postpaid', 'Post-Paid', 'postpaid', 0, 30, NULL, 26000)
ON CONFLICT (code) DO NOTHING;
