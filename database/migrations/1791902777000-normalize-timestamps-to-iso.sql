-- One format for timestamps (bench-review#52).
--
-- Two writers, two formats, one column. SQLite column defaults are
-- CURRENT_TIMESTAMP, which produces `2026-10-13 12:00:00`; the app's actions
-- write `new Date().toISOString()`, which produces `2026-10-13T12:00:00.000Z`.
-- Both land in the same TEXT column depending on which path created the row.
--
-- That is not cosmetic, because these columns are compared as STRINGS:
--
--   sqlite> SELECT '2026-10-13 12:00:00' < '2026-10-13T11:00:00.000Z';
--   1
--
-- A row created at 12:00 sorts BEFORE one created at 11:00, because 'T'
-- (0x54) is greater than ' ' (0x20). Every `ORDER BY created_at DESC` in the
-- app — the feed, the moderation queue, the audit log — silently interleaves
-- wrongly once a table holds both shapes.
--
-- Live today in `judges`: 2,740 imported rows are space-format, and the admin
-- create path added in this issue's sibling work writes ISO. The first judge
-- added through the UI would have sorted into the wrong place against them.
--
-- ISO is the target rather than the space format because that is what the
-- application code produces, what JSON carries, and what `new Date(...)`
-- parses unambiguously in every browser.
--
-- The WHERE clause matches the bare-datetime shape exactly — 19 characters
-- with a space at position 11 — so a value already in ISO is left alone and
-- re-running this is a no-op.

UPDATE "judges"             SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judges"             SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "court_houses"       SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "court_houses"       SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_reviews"      SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_reviews"      SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "review_comments"    SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "review_comments"    SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "review_flags"       SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "review_flags"       SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "review_photos"      SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "review_photos"      SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "review_drafts"      SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "review_drafts"      SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_follows"      SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_opinions"     SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_opinions"     SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_responses"    SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_responses"    SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_submissions"  SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_submissions"  SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_reviews_likes" SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_reviews_likes" SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "moderation_logs"    SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "moderation_logs"    SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "users"              SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "users"              SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "subscribers"        SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "subscribers"        SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_search_queries" SET "created_at" = replace("created_at", ' ', 'T') || 'Z' WHERE "created_at" LIKE '____-__-__ __:__:__';
UPDATE "judge_search_queries" SET "updated_at" = replace("updated_at", ' ', 'T') || 'Z' WHERE "updated_at" LIKE '____-__-__ __:__:__';
