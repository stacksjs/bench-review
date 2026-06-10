CREATE UNIQUE INDEX IF NOT EXISTS "users_verified_judge_claim_unique" ON "users" ("claimed_judge_id") WHERE "credential_verified_at" IS NOT NULL AND "credential_type" = 'judge';
