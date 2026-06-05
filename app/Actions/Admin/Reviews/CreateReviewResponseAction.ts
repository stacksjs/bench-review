import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { sanitizeReviewHtml } from '../../../Helpers/sanitizeReviewHtml'

/**
 * POST /api/admin/reviews/{id}/response — post (or replace) the judge's
 * official response to a review (right-of-reply).
 *
 * Admin-mediated: judges don't have accounts yet, so an admin posts the
 * response on the judge's behalf from the moderation surface. One response
 * per review — re-posting replaces it. `judge_id` is copied off the review
 * so the response is attributed + displayable on the article without a
 * join back through the review every render. Auth + admin gated on the route.
 */
export default new Action({
  name: 'Admin Create Review Response',
  description: 'Post the judge\'s official response to a review (right-of-reply)',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number(request.params?.id)

    const review = await db.selectFrom('judge_reviews')
      .select(['id', 'judge_id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, judge_id: number | null } | undefined
    if (!review)
      return response.json({ error: 'Review not found.' }, 404)

    // Same sanitiser as reviews/comments — strips inline styles, classes,
    // and disallowed tags so a pasted response can't break the article
    // layout or smuggle a <script> through the article's x-html binding.
    const body = (await sanitizeReviewHtml(String(request.get?.('body') ?? ''))).trim()
    if (body.length < 1)
      return response.json({ error: 'Response cannot be empty.' }, 422)
    if (body.length > 5000)
      return response.json({ error: 'Response must be at most 5000 characters.' }, 422)

    const now = new Date().toISOString()

    // Upsert — one official response per review.
    const existing = await db.selectFrom('judge_responses')
      .select(['id'])
      .where('judge_review_id', '=', reviewId)
      .executeTakeFirst() as { id: number } | undefined

    if (existing) {
      await db.updateTable('judge_responses')
        .set({ body, updated_at: now } as any)
        .where('id', '=', existing.id)
        .execute()
    }
    else {
      await db.insertInto('judge_responses').values({
        judge_review_id: reviewId,
        judge_id: review.judge_id,
        body,
        uuid: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      } as any).execute()
    }

    return response.json({ ok: true, review_id: reviewId, body })
  },
})
