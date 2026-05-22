CREATE TABLE IF NOT EXISTS "judge_reviews_likes" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "judge_review_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  UNIQUE("judge_review_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "judge_reviews_likes_user_id_idx"
  ON "judge_reviews_likes" ("user_id");
