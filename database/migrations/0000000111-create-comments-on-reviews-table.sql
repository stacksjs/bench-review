-- bench-review#44 — comments under reviews.
--
-- Why a new table rather than reusing the framework's `comments`
-- table: this is review-scoped commentary with its own moderation
-- lifecycle (auto-publish + community-flagged), and we don't want
-- to entangle with the polymorphic `commentable_*` pattern the
-- framework default uses for CMS posts. Single-purpose, simple.
--
-- Auto-publish by default (`status = 'published'`) — comments are
-- short, fast, lower-stakes than reviews. Community flagging via
-- the review_flags table can extend to comments later; admins can
-- set status='rejected' to take a comment down without deleting.
--
-- `anonymized` mirrors the same flag from judge_reviews
-- (bench-review#36) — clerks / attorneys can post anonymous
-- commentary the same way.
--
-- Counter: `judge_reviews.comments` already exists. The submit /
-- delete actions for this table update that denormalized counter
-- so card-strip listings don't need a JOIN to count.

CREATE TABLE IF NOT EXISTS "review_comments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "judge_review_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "anonymized" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'published',
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT
);

CREATE INDEX IF NOT EXISTS "review_comments_review_status_idx"
  ON "review_comments" ("judge_review_id", "status");
CREATE INDEX IF NOT EXISTS "review_comments_user_idx"
  ON "review_comments" ("user_id");
