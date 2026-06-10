CREATE INDEX IF NOT EXISTS "judge_submissions_status_idx" ON "judge_submissions" ("status", "created_at");
