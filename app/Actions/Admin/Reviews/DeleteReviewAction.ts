import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * DELETE /api/admin/reviews/{id} — hard-delete a review.
 *
 * Use this for content that should never have been written rather
 * than just "not currently published" — that's what
 * `UpdateReviewStatusAction` with `status='rejected'` is for.
 */
export default new Action({
  name: 'Admin Delete Review',
  description: 'Hard-delete a review row',
  method: 'DELETE',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number(request.params?.id)

    // Pull the full row BEFORE deleting so the moderation log can keep a
    // snapshot. A hard delete otherwise destroys the only record of what
    // was published — exactly what a later defamation suit or a law-
    // enforcement inquiry about a removed threatening review needs.
    const existing = await db.selectFrom('judge_reviews')
      .select(['id', 'title', 'content', 'rating', 'type', 'status', 'judge_id', 'user_id', 'anonymized', 'created_at'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as Record<string, unknown> | undefined
    if (!existing)
      return response.json({ error: 'Review not found.' }, 404)

    // Cascade to every child table that FKs judge_reviews (SQLite has no
    // FK constraints, so app-level cascade is the only cleanup — mirrors
    // DeleteMyReviewAction). Best-effort on children so a missing table
    // doesn't 500; the judge_reviews delete is the must-succeed step.
    // (Photo FILES on disk aren't removed here — separate storage sweep.)
    await db.deleteFrom('judge_reviews_likes').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('review_comments').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('review_photos').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('review_flags').where('judge_review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('user_notifications').where('review_id', '=', reviewId).execute().catch(() => {})
    await db.deleteFrom('judge_reviews').where('id', '=', reviewId).execute()

    const admin = await Auth.user().catch(() => null)
    if ((admin as any)?.id)
      await logModeration({
        actorUserId: Number((admin as any).id),
        action: 'review.delete',
        targetType: 'review',
        targetId: reviewId,
        metadata: { snapshot: existing },
      })

    return response.json({ ok: true, deleted: reviewId })
  },
})
