CREATE TABLE IF NOT EXISTS "judge_reviews" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "title" TEXT,
  "content" TEXT,
  "rating" INTEGER,
  "likes" INTEGER,
  "comments" INTEGER,
  "type" TEXT,
  "status" TEXT,
  "judge_id" INTEGER,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);