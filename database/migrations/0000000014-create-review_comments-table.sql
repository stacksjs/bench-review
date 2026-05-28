CREATE TABLE IF NOT EXISTS "review_comments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "body" TEXT,
  "anonymized" INTEGER default 0,
  "status" TEXT default 'published',
  "judge_review_id" INTEGER,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);