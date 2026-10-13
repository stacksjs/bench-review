import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { isUniqueViolation } from '../../Helpers/dbErrors'
import { schema } from '@stacksjs/validation'
import { notifyModeratorsOfFlag } from '../../Helpers/notifyModerators'

/**
 * POST /api/reviews/{id}/flag — community report for a review.
 *
 * Anyone (signed-in or anonymous) can submit; the reporter's identity
 * is captured when present so we can rate-limit repeat-flaggers and
 * spot abuse patterns. Anonymous flags accepted because the trust
 * model needs friction-free reporting — a reader shouldn't have to
 * sign up just to surface a problem. Anti-abuse: the route applies a
 * 10/10min/IP throttle (routes/api.ts).
 *
 * Status starts at 'open'. Admin queue surfaces these; the moderator
 * dismisses (no review change) or actions (review gets edited/
 * rejected as a result). Dedup for signed-in reporters is enforced in TWO
 * places: the explicit lookup below, which turns a repeat flag into a
 * silent 200, and a partial unique index on
 * `(judge_review_id, user_id) WHERE user_id IS NOT NULL` that closes the
 * race between that lookup and the insert (bench-review#47). The lookup is
 * the UX layer — a friendly answer — and the index is the guarantee.
 * Anonymous repeat-flags are bounded only by the route throttle: the index
 * deliberately excludes them, since NULL user_ids would otherwise collapse
 * every anonymous report on a review into one row.
 *
 * Resolves bench-review#27.
 */
const ALLOWED_REASONS = new Set([
  'off_topic',
  'harassment',
  'threat',
  'spam',
  'privacy',
  'inaccurate',
  // Copyright, separately from 'other' (bench-review#54). A DMCA notice
  // routed into a generic bucket is a DMCA notice nobody can find, and
  // §512 safe harbour turns on acting expeditiously on notices you
  // received — which is hard to evidence if the taxonomy never recorded
  // that one arrived.
  'copyright',
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

    // Capture reporter id when signed in. Anonymous flags pass user_id=null
    // and are NOT deduplicated (no per-anon identifier persisted) — the
    // route throttle (10/10min/IP) is the only guard against anon repeats.
    // Persistent anon dedup would need an ip column on review_flags.
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

    // Alert moderators on the FIRST open flag for a review (not every flag —
    // anonymous flagging is frictionless and would spam otherwise). Count
    // BEFORE inserting: 0 existing open flags → this is the first.
    let isFirstOpenFlag = false
    try {
      const openRows = await db.selectFrom('review_flags')
        .select(['id'])
        .where('judge_review_id', '=', reviewId)
        .where('status', '=', 'open')
        .execute() as Array<{ id: number }>
      isFirstOpenFlag = openRows.length === 0
    }
    catch { /* non-fatal */ }

    const now = new Date().toISOString()
    try {
      await db.insertInto('review_flags').values({
        judge_review_id: reviewId,
        user_id: userId,
        reason,
        details,
        status: 'open',
        created_at: now,
        updated_at: now,
      } as any).execute()
    }
    catch (err) {
      // Lost the race against another tab or a double-tap: the index did the
      // job the lookup above could not guarantee. Same answer the lookup
      // gives, for the same reason — a repeat flag is not an error, and
      // saying so would reveal that the reporter had flagged this before.
      if (!isUniqueViolation(err))
        throw err
      return response.json({ ok: true, duplicate: true })
    }

    // Best-effort moderator alert (non-fatal — a mail failure must never
    // fail the flag itself).
    if (isFirstOpenFlag)
      void notifyModeratorsOfFlag(reviewId, reason)

    return response.json({ ok: true })
  },
})
