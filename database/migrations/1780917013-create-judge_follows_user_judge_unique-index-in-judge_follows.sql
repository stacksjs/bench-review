CREATE UNIQUE INDEX IF NOT EXISTS "judge_follows_user_judge_unique" ON "judge_follows" ("user_id", "judge_id");
