-- Adds an optional `organisation` field to members.
-- Use case: cluster post-paid members that belong to the same employer,
-- corporate account or partner org so a single invoice can be produced
-- against the whole group at billing time. The column is nullable and
-- unconstrained (free text) so front-desk can type an org name today and
-- we can normalise into a lookup table later without a data migration.
--
-- The btree_gin index on lower(organisation) supports case-insensitive
-- grouping queries like:
--   SELECT organisation, COUNT(*) FROM members
--    WHERE organisation IS NOT NULL AND organisation <> ''
--    GROUP BY organisation ORDER BY 2 DESC;
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS organisation TEXT;

CREATE INDEX IF NOT EXISTS members_organisation_lower_idx
  ON members ((lower(organisation)))
  WHERE organisation IS NOT NULL AND organisation <> '';
