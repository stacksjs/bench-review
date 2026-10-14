-- Soft delete for admin takedown (bench-review#53).
--
-- Admin takedown was a hard DELETE. On a site publishing reviews of named,
-- sitting judges that is the wrong default for the two situations most likely
-- to require a takedown:
--
--   - a threat. If law enforcement later asks what was published, who wrote
--     it and when it was removed, a hard delete means nothing exists to
--     answer with.
--   - a judicial-privacy removal request. The obligation is to remove covered
--     information quickly; being able to show WHAT was removed and WHEN is how
--     compliance is evidenced afterwards.
--
-- `deleted_at` records when. The exclusion from public view is done by
-- `status = 'removed'`, which needs no new filtering anywhere: every public
-- query already selects `status = 'published'`, so a removed row disappears
-- from the feed, the judge page, the article route and the sitemap the moment
-- the status flips. That is deliberate — a soft delete that relies on every
-- future query remembering to add `WHERE deleted_at IS NULL` is a soft delete
-- that leaks.
--
-- NOT enabling the query-builder's global softDeletes flag. That would change
-- read behaviour for all 60-odd tables at once to fix one, and the status
-- filter already does the work here.
--
-- 'removed' is distinct from 'rejected'. Rejected is moderation: the author
-- sees it, can edit and resubmit. Removed is a takedown: invisible to
-- everyone including the author, and not editable. Mixing them would let an
-- author edit their way out of a legally-compelled removal.

ALTER TABLE "judge_reviews" ADD COLUMN "deleted_at" TEXT;

CREATE INDEX IF NOT EXISTS "idx_judge_reviews_deleted_at" ON "judge_reviews" ("deleted_at");
