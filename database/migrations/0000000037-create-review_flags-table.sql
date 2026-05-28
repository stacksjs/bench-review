CREATE TABLE IF NOT EXISTS "review_flags" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "reason" TEXT,
  "details" TEXT,
  "status" TEXT default 'open',
  "moderator_id" INTEGER,
  "moderator_note" TEXT,
  "judge_review_id" INTEGER,
  "user_id" INTEGER,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);