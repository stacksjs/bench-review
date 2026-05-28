CREATE TABLE IF NOT EXISTS "review_drafts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "title" TEXT,
  "content" TEXT,
  "rating" INTEGER,
  "type" TEXT,
  "anonymized" INTEGER default 0,
  "user_id" INTEGER,
  "judge_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);