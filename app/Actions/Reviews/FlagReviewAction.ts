import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/reviews/{id}/flag — community report for a review.
 *
 * Anyone (signed-in or anonymous) can submit; the reporter's identity
 * is captured when present so we can rate-limit repeat-flaggers and
 * spot abuse patterns. Anonymous flags accepted because the trust
 * model needs friction-free reporting — a reader shouldn't have to
 * sign up just to surface a problem. Anti-abuse note: rate-limit on
 * the route layer (TODO once we have a middleware for it).
 *
 * Status starts at 'open'. Admin queue surfaces these; the moderator
 * dismisses (no review change) or actions (review gets edited/
 * rejected as a result). The unique (judge_review_id, user_id) index
 * stops signed-in users from spam-flagging the same review.
 *
 * Resolves bench-review#27.
 */
const ALLOWED_REASONS = new Set([
  'off_topic',
  'harassment',
  'spam',
  'privacy',
  'inaccurate',
  'other',
])

export default new Action({
  name: 'Flag Review',
  description: 'Submit a community flag against a review',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const reviewId = Number(request.params?.id)

    const reason = String(request.get?.('reason') ?? '').trim().toLowerCase()
    if (!ALLOWED_REASONS.has(reason))
      return response.json({ error: 'Pick one of: off_topic, harassment, spam, privacy, inaccurate, other.' }, 422)

    const detailsRaw = request.get?.('details')
    const details = typeof detailsRaw === 'string' ? detailsRaw.trim().slice(0, 2000) : null

    // Verify the review exists before recording the flag — flags
    // against nonexistent reviews are noise and dirty the moderator
    // queue. Also prevent the trivial "is this id taken" probe by
    // returning 404 in the same shape as anywhere else.
    const review = await db.selectFrom('judge_reviews')
      .select(['id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number } | undefined
    if (!review)
      return response.json({ error: 'Review not found.' }, 404)

    // Capture reporter id when signed in. Anonymous flags pass user_id=null;
    // the partial-unique index in the migration scopes the dedup constraint
    // to non-null user_ids, so anonymous repeat-flags don't collide.
    let userId: number | null = null
    try {
      const me = await Auth.user()
      userId = (me as any)?.id ?? null
    }
    catch { /* anonymous */ }

    // Idempotency for signed-in users: if they've already flagged this
    // review, accept the request silently (return 200) without
    // creating a dupe row. Surfacing a 4xx for "already flagged" feels
    // hostile and exposes whether the user previously flagged.
    if (userId != null) {
      const existing = await db.selectFrom('review_flags')
        .select(['id'])
        .where('judge_review_id', '=', reviewId)
        .where('user_id', '=', userId)
        .executeTakeFirst() as { id: number } | undefined
      if (existing)
        return response.json({ ok: true, duplicate: true })
    }

    const now = new Date().toISOString()
    await db.insertInto('review_flags').values({
      judge_review_id: reviewId,
      user_id: userId,
      reason,
      details,
      status: 'open',
      created_at: now,
      updated_at: now,
    } as any).execute()

    return response.json({ ok: true })
  },
})
