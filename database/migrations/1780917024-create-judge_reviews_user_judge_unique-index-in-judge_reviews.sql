CREATE UNIQUE INDEX IF NOT EXISTS "judge_reviews_user_judge_unique" ON "judge_reviews" ("user_id", "judge_id") WHERE "status" != 'rejected' AND "user_id" IS NOT NULL;
