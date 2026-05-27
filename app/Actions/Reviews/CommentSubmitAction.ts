import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { sanitizeReviewHtml } from '../../Helpers/sanitizeReviewHtml'

/**
 * POST /api/reviews/{id}/comments — author a comment under a review.
 *
 * Auto-published. Comments are short, fast, lower-stakes than the
 * reviews themselves — gating them behind a moderation queue would
 * kill the back-and-forth pattern Yelp-style discussion needs. Admin
 * can set status='rejected' to take a specific comment down; the
 * flagging system from #27 will extend to comments in a follow-up.
 *
 * Body length: 5–2000 chars. Above the title-of-a-review floor (10),
 * way below the body cap (10000) — comments are a sentence, not an
 * essay.
 *
 * `anonymized` accepted per bench-review#36 — same flag as reviews,
 * same render gating via publicReviewerFor in the GET endpoint.
 *
 * Counter sync: bumps `judge_reviews.comments`. Card listings read
 * the denormalised counter rather than COUNTing on every render.
 *
 * Resolves bench-review#44 (submit half).
 */
export default new Action({
  name: 'Submit Review Comment',
  description: 'Auto-publishing comment under a review',
  method: 'POST',
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

    const reviewId = Number((request as any).params?.id)

    // Body validation. Use the same sanitiser as reviews so a
    // pasted-from-Word comment doesn't bring its layout-style noise
    // to the page.
    const bodyInput = String((request as any).get?.('body') ?? '')
    const body = (await sanitizeReviewHtml(bodyInput)).trim()
    if (body.length < 5)
      return response.json({ error: 'Comment must be at least 5 characters.' }, 422)
    if (body.length > 2000)
      return response.json({ error: 'Comment must be at most 2000 characters.' }, 422)

    // Anonymity flag (bench-review#36).
    const anonRaw = (request as any).get?.('anonymized')
    const anonymized = anonRaw === true || anonRaw === 'true' || anonRaw === 1 || anonRaw === '1' ? 1 : 0

    // Confirm the review exists. A comment against a missing review
    // is noise — bail early so the moderator queue isn't littered.
    const review = await db.selectFrom('judge_reviews' as any)
      .select(['id', 'comments'] as any)
      .where('id' as any, '=', reviewId)
      .executeTakeFirst() as { id: number, comments: number | null } | undefined
    if (!review)
      return response.json({ error: 'Review not found' }, 404)

    const now = new Date().toISOString()
    await db.insertInto('review_comments' as any).values({
      judge_review_id: reviewId,
      user_id: Number(userId),
      body,
      anonymized,
      status: 'published',
      created_at: now,
      updated_at: now,
    } as any).execute()

    // Counter sync. Denormalised on judge_reviews so card lists can
    // read the count without JOINing. Best-effort — if the update
    // fails, the comment still landed; the count just drifts by one
    // until the next refresh. Tolerable.
    await db.updateTable('judge_reviews' as any)
      .set({ comments: Number(review.comments ?? 0) + 1 } as any)
      .where('id' as any, '=', reviewId)
      .execute()
      .catch(() => {})

    // Return the inserted row so the client can append optimistically.
    const inserted = await db.selectFrom('review_comments' as any)
      .selectAll()
      .where('judge_review_id' as any, '=', reviewId)
      .where('user_id' as any, '=', Number(userId))
      .orderBy('id' as any, 'desc')
      .limit(1)
      .executeTakeFirst() as Record<string, any> | undefined

    return response.json({ ok: true, comment: inserted }, 201)
  },
})
