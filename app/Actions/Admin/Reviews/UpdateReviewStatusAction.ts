import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * PATCH /api/admin/reviews/{id}/status — approve or reject a review.
 *
 * Body:
 *   - status : 'published' | 'rejected'
 *
 * The public feed (`LatestReviewsAction` / `ReviewsByJudgeAction`)
 * filters `status = 'published'`, so flipping a row to `rejected` is
 * a soft-take-down that leaves the row in the table — the admin can
 * un-reject later if needed. Hard delete is a separate action.
 */
const ALLOWED_STATUSES = new Set(['published', 'rejected'])

export default new Action({
  name: 'Admin Update Review Status',
  description: 'Approve or reject a pending or already-moderated review',
  method: 'PATCH',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number((request as any).params?.id)
    const status = String((request as any).get?.('status') ?? '').trim().toLowerCase()

    if (!ALLOWED_STATUSES.has(status))
      return response.json({ error: 'Status must be "published" or "rejected".' }, 422)

    const existing = await db.selectFrom('judge_reviews' as any)
      .select(['id'] as any)
      .where('id' as any, '=', reviewId)
      .executeTakeFirst()
    if (!existing)
      return response.json({ error: 'Review not found.' }, 404)

    await db.updateTable('judge_reviews' as any)
      .set({ status, updated_at: new Date().toISOString() } as any)
      .where('id' as any, '=', reviewId)
      .execute()

    return response.json({ ok: true, id: reviewId, status })
  },
})
