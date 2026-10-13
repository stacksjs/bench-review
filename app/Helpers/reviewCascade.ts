import { db } from '@stacksjs/database'

/**
 * Delete a review and everything that hangs off it (bench-review#52).
 *
 * Both review-delete paths carried their own copy of this list and both
 * omitted the same table: `judge_responses`, the judge's official reply. That
 * is not a tidiness problem. Every child table holds a real foreign key to
 * `judge_reviews` with ON DELETE NO ACTION, and foreign keys ARE enforced on
 * the app's connection — so a review that a judge had responded to could not
 * be deleted at all. The final delete threw a constraint error with nothing to
 * catch it, and the moderator got a 500 on the one review most likely to need
 * taking down.
 *
 * Order is load-bearing: children first, parent last. The same list in the
 * wrong order is a constraint violation rather than a cascade.
 *
 * `user_notifications` has no FK (it predates the repair pass) but is included
 * because a notification pointing at a deleted review renders a dead row in
 * the bell feed.
 */

/** Child tables keyed by `judge_review_id`, in delete order. */
const REVIEW_CHILDREN = [
  'judge_reviews_likes',
  'review_comments',
  'review_photos',
  'review_flags',
  // The omission that made this a bug rather than a refactor.
  'judge_responses',
] as const

export async function deleteReviewCascade(reviewId: number): Promise<void> {
  for (const table of REVIEW_CHILDREN) {
    await db.deleteFrom(table as any)
      .where('judge_review_id', '=', reviewId)
      .execute()
      .catch((err: unknown) => {
        // Best-effort per table: a table missing on a fresh checkout should
        // make this a no-op rather than block the delete. A FK violation here
        // would surface on the parent delete below, which is NOT swallowed.
        console.warn(`[review-cascade] could not clear ${table} for review ${reviewId}:`, err instanceof Error ? err.message : err)
      })
  }

  await db.deleteFrom('user_notifications' as any)
    .where('review_id', '=', reviewId)
    .execute()
    .catch(() => {})

  // Deliberately NOT caught. If a child table still holds rows, the foreign
  // key refuses this and the caller must hear about it — a silently skipped
  // parent delete is how "deleted" reviews stay on the site.
  await db.deleteFrom('judge_reviews').where('id', '=', reviewId).execute()
}

/**
 * Cascade every review a user wrote. Used by account deletion, which deleted
 * `judge_reviews` by user_id directly and swallowed the result: any review
 * carrying a comment, photo, flag or judge response failed its foreign key,
 * the error went into a `.catch(() => {})`, and the review SURVIVED an
 * erasure request while the user's own rows around it were removed.
 */
export async function deleteReviewsByUser(userId: number): Promise<number> {
  const rows = await db.selectFrom('judge_reviews')
    .select(['id'])
    .where('user_id', '=', userId)
    .execute() as Array<{ id: number }>

  for (const row of rows)
    await deleteReviewCascade(Number(row.id))

  return rows.length
}
