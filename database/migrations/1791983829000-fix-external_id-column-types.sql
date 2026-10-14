-- `external_id` is a string key, not a number (bench-review#52 follow-up).
--
-- `./buddy migrate` reports this on every run:
--
--   WARN The live schema does not match the models.
--     • socialposts.externalid is INTEGER, models declare varchar
--     • judgeopinions.externalid is INTEGER, models declare varchar
--
-- It also says, correctly, that migrations will not fix it on their own: the
-- runner only applies files that have not run, and a corrected
-- CREATE TABLE IF NOT EXISTS is a no-op against a table that already exists.
--
-- Why it matters, given SQLite does not enforce column types. `external_id` on
-- judge_opinions is the dedup key for a CourtListener opinions importer, and
-- those ids are strings. SQLite would store 'cl:12345' in an INTEGER column
-- quite happily — affinity conversion only applies when it is lossless — so
-- this is invisible locally and stays invisible right up until the Postgres
-- migration DEPLOY.md names as the production target, where inserting a
-- string into an integer column is a hard error.
--
-- Same family as the postgres port default that said 3306: inert on the
-- database we develop against, broken on the one we are heading for.
--
-- Both tables hold zero rows, so this drops and recreates rather than doing
-- the copy-rebuild dance in database/repairs/. Indexes are recreated after;
-- the judge_opinions ones are reproduced here verbatim from the live schema.

DROP TABLE IF EXISTS "judge_opinions";

CREATE TABLE "judge_opinions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "case_name" TEXT,
  "citation" TEXT,
  "decision_date" TEXT,
  "summary" TEXT,
  "outcome_label" TEXT,
  "source_url" TEXT,
  "source_provider" TEXT default 'manual',
  "external_id" TEXT,
  "judge_id" INTEGER REFERENCES "judges"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

CREATE INDEX IF NOT EXISTS "judge_opinions_judge_opinions_judge_date_idx" ON "judge_opinions" ("judge_id", "decision_date");
CREATE UNIQUE INDEX IF NOT EXISTS "judge_opinions_uuid_unique" ON "judge_opinions" ("uuid");

DROP TABLE IF EXISTS "social_posts";

CREATE TABLE "social_posts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "content" TEXT,
  "platform" TEXT CHECK ("platform" IN ('twitter', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube')),
  "status" TEXT CHECK ("status" IN ('draft', 'scheduled', 'published', 'failed')) default 'draft',
  "scheduled_at" TEXT,
  "published_at" TEXT,
  "likes" INTEGER default 0,
  "shares" INTEGER default 0,
  "comments" INTEGER default 0,
  "reach" INTEGER default 0,
  "image_url" TEXT,
  "external_id" TEXT,
  "user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_social_posts_user_id" ON "social_posts" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_uuid_unique" ON "social_posts" ("uuid");
