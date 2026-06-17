import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * DELETE /api/me/reviews/{id} — author removes their own review.
 *
 * Permitted on ANY status (pending / rejected / published) — the
 * author is in charge of their own content. Cascades the same way as
 * the admin delete: likes, comments, photos, flags, the review's
 * notifications, and the row itself.
 *
 * Non-owners get 404 (response indistinguishable from a missing row).
 */
export default new Action({
  name: 'Delete My Review',
  description: 'Hard-delete a review you authored, cascading like/notification rows',
  method: 'DELETE',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const reviewId = Number(request.params?.id)

    const existing = await db.selectFrom('judge_reviews')
      .select(['id', 'user_id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null } | undefined

    if (!existing || existing.user_id == null || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Review not found' }, 404)

    // Cascade to every child table that FKs judge_reviews (SQLite has no
    // FK constraints here, so app-level cascade is the only cleanup).
    // Best-effort on the children so a missing table on a fresh checkout
    // doesn't 500 the request — the judge_reviews delete is the only
    // must-succeed step. (Photo FILES on disk are not removed here — a
    // separate storage-sweep concern; only the rows go.)
    await db.deleteFrom('judge_reviews_likes').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('review_comments').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('review_photos').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('review_flags').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('user_notifications').where('review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('judge_reviews').where('id', '=', reviewId).execute()

    return response.json({ ok: true, deleted: reviewId })
  },
})
