import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { sanitizeReviewHtml } from '../../Helpers/sanitizeReviewHtml'

/**
 * POST /api/me/reviews/{id}/response — a VERIFIED judge posts (or replaces)
 * their official response to a review of them (self-serve right-of-reply).
 *
 * Gate: the signed-in user must be a verified judge — `credential_type='judge'`,
 * `credential_verified_at` set, and `claimed_judge_id` equal to the review's
 * `judge_id`. Otherwise 403. Writes the same `JudgeResponse` row the
 * admin-mediated path uses, so the two coexist (an admin can still post on
 * a judge's behalf, e.g. before they've claimed their profile).
 */
export default new Action({
  name: 'Submit Judge Response',
  description: 'Verified judge posts their official response to a review',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const userId = (me as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const reviewId = Number(request.params?.id)
    const review = await db.selectFrom('judge_reviews')
      .select(['id', 'judge_id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, judge_id: number | null } | undefined
    if (!review)
      return response.json({ error: 'Review not found.' }, 404)

    // Verified-judge gate.
    const claimer = await db.selectFrom('users')
      .select(['credential_type', 'credential_verified_at', 'claimed_judge_id'])
      .where('id', '=', Number(userId))
      .executeTakeFirst() as { credential_type: string | null, credential_verified_at: string | null, claimed_judge_id: number | null } | undefined
    const isVerifiedJudge = !!claimer
      && claimer.credential_type === 'judge'
      && claimer.credential_verified_at != null
      && claimer.claimed_judge_id != null
      && review.judge_id != null
      && Number(claimer.claimed_judge_id) === Number(review.judge_id)
    if (!isVerifiedJudge)
      return response.json({ error: 'Only the verified judge for this review can respond here.' }, 403)

    const body = (await sanitizeReviewHtml(String(request.get?.('body') ?? ''))).trim()
    if (body.length < 1)
      return response.json({ error: 'Response cannot be empty.' }, 422)
    if (body.length > 5000)
      return response.json({ error: 'Response must be at most 5000 characters.' }, 422)

    const now = new Date().toISOString()
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
