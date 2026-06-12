-- Scope discounts to specific activities and/or membership plans.
--
-- Until now every discount applied to every product the gym sells.
-- Operationally that's wrong: a "Gym Weekend" promo should apply only
-- to gym plans, not to steam/combo packages, and an "Aerobics intro"
-- discount shouldn't drop the price of equipment rentals.
--
-- Model: two array columns on the discounts row itself, both defaulting
-- to empty. Semantics:
--   • Empty arrays  → discount applies to every plan / every activity
--                     (preserves the pre-migration behaviour of every
--                     existing row, so no data backfill needed).
--   • Non-empty     → discount only redeemable against the listed
--                     items. Plan codes match PLANS / GROUP_PLANS in
--                     App.jsx (e.g. 'gym_monthly', 'combo_session');
--                     activity ids are UUID FKs into activities(id).
--
-- We don't enforce the FK on the UUID[] column directly — Postgres
-- can't do that — but the front-end always sends ids from the
-- adapter-loaded activities list, so orphans are unlikely. If an
-- activity is hard-deleted the discount row simply lists a stale id;
-- a periodic cleanup or the redemption logic should ignore unknown
-- ids. Soft-delete (is_active=false) is the more common path.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS keeps this safe on re-run.

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS activity_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ADD COLUMN IF NOT EXISTS plan_codes   TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- GIN indexes so "which discounts apply to activity X / plan Y" stays
-- fast as the discounts table grows. The redemption query at checkout
-- will look like:
--   WHERE activity_ids = '{}' OR $1 = ANY(activity_ids)
-- and the GIN index covers the ANY() side.
CREATE INDEX IF NOT EXISTS discounts_activity_ids_idx
  ON discounts USING GIN (activity_ids);
CREATE INDEX IF NOT EXISTS discounts_plan_codes_idx
  ON discounts USING GIN (plan_codes);
