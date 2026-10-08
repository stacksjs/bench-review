-- Index every foreign key column.
--
-- SQLite indexes the PARENT side of a foreign key automatically (the
-- referenced column must already be a primary key or unique) but never the
-- CHILD side. So every constraint added in the 3d3d861d repair made the child
-- table scannable-only: each parent DELETE or primary-key UPDATE has to scan
-- the whole child table to check for referencing rows, and so does every
-- `.with('relation')` join the ORM emits.
--
-- 21 of the schema's 35 foreign key columns had no index. The one that
-- mattered today is judges.court_house_id -- touching a single courthouse
-- scanned all 2,740 judges -- but the rest are the same defect waiting for
-- the tables to fill.
--
-- Additive and idempotent: CREATE INDEX IF NOT EXISTS, no table rebuilds, no
-- data movement. Unlike database/repairs/, this IS a migration: a database
-- built from scratch wants these indexes too.
--
-- (An index-only migration is safe to run now. The runner used to skip files
-- containing nothing but index DDL -- stacksjs/stacks#1952 -- which is why
-- 30 unique indexes went missing. That is fixed, and
-- 1791307627118-add-missing-unique-indexes.sql applied cleanly under it.)

CREATE INDEX IF NOT EXISTS "idx_activities_user_id" ON "activities" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_sends_campaign_id" ON "campaign_sends" ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_sends_subscriber_id" ON "campaign_sends" ("subscriber_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_sends_email_list_id" ON "campaign_sends" ("email_list_id");
CREATE INDEX IF NOT EXISTS "idx_campaigns_email_list_id" ON "campaigns" ("email_list_id");
CREATE INDEX IF NOT EXISTS "idx_comments_user_id" ON "comments" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_email_list_subscribers_email_list_id" ON "email_list_subscribers" ("email_list_id");
CREATE INDEX IF NOT EXISTS "idx_email_list_subscribers_subscriber_id" ON "email_list_subscribers" ("subscriber_id");
CREATE INDEX IF NOT EXISTS "idx_judges_court_house_id" ON "judges" ("court_house_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_access_tokens_user_id" ON "oauth_access_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_access_tokens_oauth_client_id" ON "oauth_access_tokens" ("oauth_client_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_clients_user_id" ON "oauth_clients" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_payment_methods_user_id" ON "payment_methods" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_payment_transactions_user_id" ON "payment_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_payment_transactions_payment_method_id" ON "payment_transactions" ("payment_method_id");
CREATE INDEX IF NOT EXISTS "idx_personal_access_tokens_user_id" ON "personal_access_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_review_drafts_judge_id" ON "review_drafts" ("judge_id");
CREATE INDEX IF NOT EXISTS "idx_review_flags_user_id" ON "review_flags" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_social_posts_user_id" ON "social_posts" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_subscribers_user_id" ON "subscribers" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_user_id" ON "subscriptions" ("user_id");
