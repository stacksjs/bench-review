import { db } from '@stacksjs/database'

/**
 * Recount a review's published comments and write the result
 * (bench-review#52).
 *
 * `judge_reviews.comments` is a denormalised counter, and two of the three
 * places that maintained it did read-modify-write: read the current value,
 * add or subtract one, write it back. That is a lost update waiting to
 * happen — two comments posted in the same moment both read N and both write
 * N+1 — and, worse, it is unrecoverable: once the number is wrong it stays
 * wrong, because every later nudge is relative to a value nobody rechecks.
 *
 * Recounting instead makes every mutation self-healing. A counter that has
 * already drifted is corrected by the next comment on that review rather than
 * drifting further. The admin status change already did this; now all three
 * paths share it.
 *
 * The alternative the issue offers — deriving at read time, like
 * `reviewLikes` does — would be stronger still, since there would be no
 * number to be wrong. It is also a bigger change: the column is selected
 * directly by the feed, the article page, the admin queue and the seeder
 * fixtures. Recounting removes the drift without that surgery; dropping the
 * column is a separate piece of work.
 *
 * Published only. The counter is what readers see under a review, and
 * pending or rejected comments are not visible to them.
 */
export async function recountReviewComments(reviewId: number): Promise<number> {
  const rows = await db.selectFrom('review_comments')
    .select(['id'])
    .where('judge_review_id', '=', reviewId)
    .where('status', '=', 'published')
    .execute() as Array<{ id: number }>

  await db.updateTable('judge_reviews')
    .set({ comments: rows.length } as any)
    .where('id', '=', reviewId)
    .execute()

  return rows.length
}
