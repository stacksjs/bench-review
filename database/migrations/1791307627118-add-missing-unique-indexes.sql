-- Add the UNIQUE indexes the models declare but the live schema never got.
--
-- `buddy doctor` reported 14 of 22 declared unique constraints with no UNIQUE
-- index; checking every model's `unique: true` field and every useUuid table
-- against the live schema puts the real figure at 30. They are missing because
-- the migration runner used to skip files containing only CREATE UNIQUE INDEX
-- statements (stacksjs/stacks#1952). The runner is fixed, but the skipped
-- migrations are already recorded as applied, so they never re-run -- hence
-- this file, which states the indexes explicitly.
--
-- Verified before writing: no column has duplicate values, so none of these
-- can hard-fail, and every target table has a tracked create-table migration
-- that runs earlier, so a database built from scratch reaches here safely.
-- IF NOT EXISTS keeps it idempotent against databases that already have some.

CREATE UNIQUE INDEX IF NOT EXISTS "court_houses_uuid_unique" ON "court_houses" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "deployments_uuid_unique" ON "deployments" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "email_list_subscribers_uuid_unique" ON "email_list_subscribers" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "email_lists_slug_unique" ON "email_lists" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "email_lists_uuid_unique" ON "email_lists" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "email_subscriptions_email_unique" ON "email_subscriptions" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "judge_opinions_uuid_unique" ON "judge_opinions" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "judge_reviews_uuid_unique" ON "judge_reviews" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "judges_uuid_unique" ON "judges" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_uuid_unique" ON "notifications" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_methods_uuid_unique" ON "payment_methods" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_products_uuid_unique" ON "payment_products" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_uuid_unique" ON "payment_transactions" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "personal_access_tokens_token_unique" ON "personal_access_tokens" ("token");
CREATE UNIQUE INDEX IF NOT EXISTS "releases_uuid_unique" ON "releases" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "review_comments_uuid_unique" ON "review_comments" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "review_drafts_uuid_unique" ON "review_drafts" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "review_flags_uuid_unique" ON "review_flags" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "review_photos_uuid_unique" ON "review_photos" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_uuid_unique" ON "social_posts" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "subscribers_email_unique" ON "subscribers" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "subscribers_uuid_unique" ON "subscribers" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_id_unique" ON "subscriptions" ("provider_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_uuid_unique" ON "subscriptions" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_unique" ON "tags" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_unique" ON "tags" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_uuid_unique" ON "tags" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_name_unique" ON "teams" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_uuid_unique" ON "teams" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "users_uuid_unique" ON "users" ("uuid");
