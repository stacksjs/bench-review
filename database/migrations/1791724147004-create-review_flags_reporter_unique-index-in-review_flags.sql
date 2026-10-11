CREATE UNIQUE INDEX IF NOT EXISTS "review_flags_review_flags_reporter_unique" ON "review_flags" ("judge_review_id", "user_id") WHERE "user_id" IS NOT NULL;
