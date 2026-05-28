CREATE TABLE IF NOT EXISTS "judge_reviews_likes" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER not null,
  "judge_review_id" INTEGER not null,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT
);