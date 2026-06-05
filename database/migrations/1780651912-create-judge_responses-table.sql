CREATE TABLE IF NOT EXISTS "judge_responses" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "body" TEXT,
  "judge_review_id" INTEGER REFERENCES "judge_reviews"("id"),
  "judge_id" INTEGER REFERENCES "judges"("id"),
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT,
  "uuid" TEXT
);