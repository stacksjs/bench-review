-- bench-review#27 — community report/flag for reviews.
--
-- Each row records one reader flagging one review. user_id is nullable
-- so anonymous (logged-out) reports are accepted but rate-limited at
-- the action layer; identified reports carry the reporter's id so
-- repeat-flagging from a single user can be caught.
--
-- status lifecycle: 'open' → moderator action → 'dismissed' (false
-- positive, no review change) or 'actioned' (the review was edited or
-- rejected as a result). Dismissed flags stay in the table for audit;
-- they're filtered out of the active queue by the listing query.
--
-- The unique (judge_review_id, user_id) index prevents the same logged-
-- in user from flagging the same review twice. Anonymous flags
-- (user_id NULL) can repeat — that's intentional; rate-limiting in
-- FlagReviewAction handles abuse there.

CREATE TABLE IF NOT EXISTS "review_flags" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "judge_review_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "moderator_id" INTEGER,
  "moderator_note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "review_flags_review_user_unique"
  ON "review_flags" ("judge_review_id", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "review_flags_status_idx" ON "review_flags" ("status");
CREATE INDEX IF NOT EXISTS "review_flags_review_idx" ON "review_flags" ("judge_review_id");
