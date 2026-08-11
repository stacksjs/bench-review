import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { sanitizeReviewHtml } from '../../Helpers/sanitizeReviewHtml'

/**
 * PATCH /api/me/reviews/{id} — author edits their own review and
 * resubmits it for moderation.
 *
 * Visibility rules:
 *   - Only the row's author can call this. Non-owners get 404 (same
 *     response shape as a missing row — non-existence and access-
 *     denial indistinguishable from outside).
 *   - All statuses are editable (pending / rejected / published). The
 *     bait-and-switch risk on published edits is mitigated by the
 *     side effect below: every edit drops the row back into the
 *     moderation queue, so swapped content has to be re-approved
 *     before it goes live again.
 *
 * Side effect: every successful edit resets `status = 'pending'`. A
 * rejected review re-enters the moderation queue; a pending review
 * stays pending but with refreshed content; a published review
 * disappears from the public feed until a moderator re-approves it.
 * The moderator sees whatever the author wrote MOST RECENTLY — never
 * a stale draft.
 */
const ALLOWED_TYPES = new Set(['positive', 'negative', 'neutral'])

export default new Action({
  name: 'Update My Review',
  description: 'Edit any review you authored; resets status to pending for re-moderation',
  method: 'PATCH',
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

    const reviewId = Number(request.params?.id)

    const existing = await db.selectFrom('judge_reviews')
      // judge_id is needed for the resubmit collision check below.
      .select(['id', 'user_id', 'status', 'judge_id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null, status: string, judge_id: number | null } | undefined

    if (!existing || existing.user_id == null || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Review not found' }, 404)

    // Body fields. All optional individually — we accept partial
    // patches so the client can send only what changed. Validations
    // are inline rather than declarative-on-Action because the
    // declarative `validations:` block only covers path params here.
    const titleInput = request.get?.('title')
    const contentInput = request.get?.('content')
    const ratingInput = request.get?.('rating')
    const typeInput = request.get?.('type')

    const patch: Record<string, unknown> = {}

    if (typeof titleInput === 'string') {
      const t = titleInput.trim()
      if (t.length < 3 || t.length > 255)
        return response.json({ error: 'Title must be between 3 and 255 characters.' }, 422)
      patch.title = t
    }

    if (typeof contentInput === 'string') {
      // Sanitize BEFORE the length check — pasted content commonly
      // arrives wrapped in `<div style="…">` and shrinks substantially
      // once stripped. See app/Helpers/sanitizeReviewHtml.ts. The 10000
      // upper bound also stops a megabyte of pasted markup from
      // squeezing past now that we know the cleaned size.
      const cleaned = (await sanitizeReviewHtml(contentInput)).trim()
      if (cleaned.length > 10000)
        return response.json({ error: 'Content must be between 10 and 10000 characters once formatting is cleaned up.' }, 422)
      // Measure VISIBLE TEXT for the lower bound, matching SubmitReviewAction.
      // A raw-length check passes `<p></p><p><br></p><p>&nbsp;</p>` — ~31
      // characters of markup whose visible text is empty, and every tag in it
      // survives sanitisation because <p> and <br> are both allowlisted. That
      // is the exact bypass the submit path was hardened against ("how a
      // title-only, blank-body review got through"); the edit path still had
      // it, so an author could blank their own published review's body and
      // push it back into the moderation queue that way.
      const visibleText = cleaned
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (visibleText.length < 10)
        return response.json({ error: 'Review must be at least 10 characters of actual text.' }, 422)
      patch.content = cleaned
    }

    if (ratingInput !== undefined && ratingInput !== null) {
      const r = Number(ratingInput)
      if (!Number.isFinite(r) || r < 1 || r > 5)
        return response.json({ error: 'Rating must be between 1 and 5.' }, 422)
      patch.rating = Math.floor(r)
    }

    if (typeof typeInput === 'string') {
      const t = typeInput.trim().toLowerCase()
      if (!ALLOWED_TYPES.has(t))
        return response.json({ error: 'Type must be positive, negative, or neutral.' }, 422)
      patch.type = t
    }

    // Anonymity toggle (bench-review#36). Authors can flip the
    // anonymity flag at any time — privacy is a continuous control,
    // not a one-shot at submit. Every edit kicks the review back to
    // pending anyway, so the public surfaces re-render with the new
    // flag after re-approval.
    const anonInput = request.get?.('anonymized')
    if (anonInput !== undefined && anonInput !== null) {
      patch.anonymized = anonInput === true || anonInput === 'true' || anonInput === 1 || anonInput === '1' ? 1 : 0
    }

    if (Object.keys(patch).length === 0)
      return response.json({ error: 'No editable fields supplied.' }, 422)

    // Resubmit semantics: every successful edit bumps status back to
    // pending. The moderator queue gets the fresh content.
    //
    // A rejected review needs a collision check first. The partial unique index
    //
    //   UNIQUE (user_id, judge_id) WHERE status != 'rejected' AND user_id IS NOT NULL
    //
    // deliberately lets a rejected row coexist with a live one — SubmitReview
    // only blocks duplicates in ('pending','published') precisely so a user
    // whose review was declined can write a fresh one. Promoting the rejected
    // row back to pending makes BOTH rows match the index, and this action had
    // no pre-check and no error handling around the UPDATE, so SQLite's
    // constraint error surfaced as a raw 500 on a flow this action's own
    // docblock advertises. Mirror the submit path's friendly 409 instead.
    if (existing.status === 'rejected' && existing.judge_id != null) {
      const live = await db.selectFrom('judge_reviews')
        .select(['id'])
        .where('user_id', '=', userId)
        .where('judge_id', '=', existing.judge_id)
        .where('status', 'in', ['pending', 'published'] as any)
        .executeTakeFirst()
      if (live)
        return response.json({ error: 'You already have another review of this judge awaiting moderation or published. Edit that one instead.' }, 409)
    }

    patch.status = 'pending'
    patch.updated_at = new Date().toISOString()

    await db.updateTable('judge_reviews')
      .set(patch as any)
      .where('id', '=', reviewId)
      .execute()

    const fresh = await db.selectFrom('judge_reviews')
      .selectAll()
      .where('id', '=', reviewId)
      .executeTakeFirst()

    return response.json({ ok: true, review: fresh })
  },
})
