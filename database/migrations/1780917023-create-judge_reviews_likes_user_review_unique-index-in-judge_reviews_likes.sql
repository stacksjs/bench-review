CREATE UNIQUE INDEX IF NOT EXISTS "judge_reviews_likes_user_review_unique" ON "judge_reviews_likes" ("judge_review_id", "user_id");
