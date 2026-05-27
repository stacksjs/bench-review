-- bench-review#36 — anonymous-friendly review surface for the legal
-- audience.
--
-- Two additive columns:
--
-- 1. `judge_reviews.anonymized` — when true, public render paths
--    substitute the author with "Anonymous <role_label>" (or just
--    "Anonymous reviewer" if no role is set). The author still sees
--    their own identity on /my-reviews; admins still see the real
--    author for moderation. NOT a deletion mechanism — the user_id
--    link stays intact in the DB.
--
-- 2. `users.role_label` — self-declared role classification used
--    both to label anonymous reviewers ("Anonymous attorney" vs
--    "Anonymous clerk") and as a credibility signal even on
--    non-anonymous reviews. NULLABLE so existing users aren't forced
--    to backfill before their next login.
--
-- Default values keep existing rows behaviorally identical: every
-- existing judge_review has `anonymized = 0` (false), every existing
-- user has `role_label = NULL`. The render layer handles the null
-- case ("Anonymous reviewer" with no role qualifier).

ALTER TABLE "judge_reviews" ADD COLUMN "anonymized" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users" ADD COLUMN "role_label" TEXT;

-- Index on anonymized so admin / moderation queries that segment by
-- "shown to public as anonymous" stay cheap. Public read paths
-- already filter on `status = 'published'`; the anonymized flag is
-- additive.
CREATE INDEX IF NOT EXISTS "judge_reviews_anonymized_idx" ON "judge_reviews" ("anonymized");
