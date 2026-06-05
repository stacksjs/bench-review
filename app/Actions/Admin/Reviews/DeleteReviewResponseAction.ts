import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * DELETE /api/admin/reviews/{id}/response — retract the judge's response
 * to a review (right-of-reply). Idempotent: a no-op if none exists.
 * Auth + admin gated on the route.
 */
export default new Action({
  name: 'Admin Delete Review Response',
  description: 'Retract the judge\'s official response to a review',
  method: 'DELETE',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number(request.params?.id)
    await db.deleteFrom('judge_responses')
      .where('judge_review_id', '=', reviewId)
      .execute()
    return response.json({ ok: true, review_id: reviewId })
  },
})
