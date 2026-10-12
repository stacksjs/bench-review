import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { applyReviewStatus } from '../../../Helpers/reviewModeration'

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
 *
 * Everything that follows from the change — audit row, flag close-out,
 * author notification and email, publish fan-out — lives in
 * `app/Helpers/reviewModeration.ts`, shared with the bulk endpoint.
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
    const reviewId = Number(request.params?.id)
    const status = String(request.get?.('status') ?? '').trim().toLowerCase()

    if (!ALLOWED_STATUSES.has(status))
      return response.json({ error: 'Status must be "published" or "rejected".' }, 422)

    // Resolve the moderator up front. The `admin` middleware already
    // guarantees an authenticated admin; resolving here (and 401-ing if
    // it's somehow absent) means the audit log is guaranteed an actor and
    // we never mutate review status with an unlogged moderation action.
    const admin = await Auth.user().catch(() => null)
    const adminId = (admin as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const outcome = await applyReviewStatus(reviewId, status as 'published' | 'rejected', Number(adminId))
    if (!outcome.ok) {
      const message = outcome.error ?? 'Could not update the review.'
      // Branched rather than passed through as a number: response.json()
      // takes a literal status union, so `outcome.code ?? 422` does not
      // typecheck.
      return outcome.code === 404
        ? response.json({ error: message }, 404)
        : response.json({ error: message }, 422)
    }

    return response.json({ ok: true, id: reviewId, status })
  },
})
