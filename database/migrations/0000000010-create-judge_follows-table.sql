CREATE TABLE IF NOT EXISTS "judge_follows" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "judge_id" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "judge_follows_user_judge_unique"
  ON "judge_follows" ("user_id", "judge_id");

CREATE INDEX IF NOT EXISTS "judge_follows_user_idx"
  ON "judge_follows" ("user_id");

CREATE INDEX IF NOT EXISTS "judge_follows_judge_idx"
  ON "judge_follows" ("judge_id");
