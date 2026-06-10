CREATE INDEX IF NOT EXISTS "judge_reviews_judge_status_created_idx" ON "judge_reviews" ("judge_id", "status", "created_at");
