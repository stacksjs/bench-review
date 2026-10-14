import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { deleteReviewCascadeChildren } from '../../../Helpers/reviewCascade'
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

    // Soft delete, not a hard one (bench-review#53).
    //
    // The two situations most likely to require an admin takedown are a
    // threat and a judicial-privacy removal request, and both are ones where
    // the question afterwards is "what exactly was published, and when did
    // you remove it". A hard DELETE answers neither.
    //
    // `status = 'removed'` is what hides it: every public query already
    // filters `status = 'published'`, so the row leaves the feed, the judge
    // page, the article route and the sitemap the moment this lands — no new
    // WHERE clause to remember anywhere. `deleted_at` records when.
    //
    // The CHILDREN are still hard-deleted. Comments, photos, flags, likes and
    // the judge's response are not evidence of what the author wrote, and
    // leaving a removed review's photo rows behind means the files stay
    // referenced. What is preserved is the review itself plus the snapshot
    // below.
    await deleteReviewCascadeChildren(reviewId)

    await db.updateTable('judge_reviews')
      .set({ status: 'removed', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
      .where('id', '=', reviewId)
      .execute()

    const admin = await Auth.user().catch(() => null)
    if ((admin as any)?.id)
      await logModeration({
        actorUserId: Number((admin as any).id),
        action: 'review.delete',
        targetType: 'review',
        targetId: reviewId,
        // The row survives as `status='removed'`, but its content can still be
        // redacted later. The snapshot is what the original said.
        metadata: { snapshot: existing },
      })

    return response.json({ ok: true, removed: reviewId })
  },
})
