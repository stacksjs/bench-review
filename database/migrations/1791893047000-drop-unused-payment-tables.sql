-- Drop the unused Stacks commerce scaffolding.
--
-- `payment_products`, `payment_methods`, `payment_transactions` and
-- `subscriptions` came from model files that shipped with `buddy new` and were
-- never deleted. Bench takes no payments and has no billing: all four tables
-- have always held zero rows, no action or helper ever queried them, and none
-- of the models declared `traits.useApi`, so the ORM generated no routes for
-- them either.
--
-- They are commerce-owned tables (FEATURE_TABLES.commerce in @stacksjs/buddy)
-- and `commerce` is false in config/features.ts, so `buddy migrate` would
-- normally rename their migrations to `.disabled` before running. It did not,
-- because hideDisabledFeatureMigrations() skips any table a top-level file in
-- app/Models claims by name - and the scaffold models claimed all four. The
-- models are deleted in the same commit, so the claim is gone too.
--
-- IF EXISTS because their CREATE migrations are deleted in this commit: a
-- database built from scratch never has these tables, and this must be a no-op
-- there rather than an error.
--
-- NOT dropped: `subscribers`. It is also commerce-owned, but it is the
-- newsletter list and is in active use.

DROP TABLE IF EXISTS "payment_transactions";
DROP TABLE IF EXISTS "payment_methods";
DROP TABLE IF EXISTS "payment_products";
DROP TABLE IF EXISTS "subscriptions";
