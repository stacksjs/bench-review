import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { authorRef, isAnonymized } from '../../../Helpers/anonymityMask'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * POST /api/admin/reviews/{id}/author — reveal one anonymized author's
 * identity to the moderator asking, and record that it happened
 * (bench-review#56).
 *
 * The companion to the masking in `ReviewIndexAction`. Together they turn
 * de-anonymization from a thing that happened implicitly, on every page of the
 * moderation queue, into a thing someone has to ask for one row at a time and
 * put their name against.
 *
 * Nothing here stops a determined admin: a moderator with the admin role can
 * reveal any author they want, and that is correct — threats and subpoenas are
 * real and have to be actionable. What changes is that it is no longer
 * *invisible*. The log entry names the admin, the row, the reason and the
 * time, which is what makes an abusive reveal detectable afterwards and is
 * also the record to produce if someone asks whether the anonymity promise
 * was kept.
 *
 * Body:
 *   - note : required — WHY this author needs to be identified. Same bar as
 *            `RedactReviewAction`'s reason, for the same purpose.
 *
 * POST rather than GET: this writes an audit record, and a GET that mutates
 * is also a GET that a prefetch or a logging proxy can fire by accident.
 */
export default new Action({
  name: 'Admin Reveal Review Author',
  description: 'Reveal an anonymized review author, logged to moderation_logs',
  method: 'POST',

  async handle() {
    const admin = await Auth.user().catch(() => null)
    const adminId = (admin as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const reviewId = Number(request.params?.id)
    if (!Number.isInteger(reviewId) || reviewId <= 0)
      return response.json({ error: 'Invalid review id.' }, 422)

    const note = String(request.get?.('note') ?? '').trim().slice(0, 1000)
    if (note.length < 5)
      return response.json({ error: 'A reason for revealing this author is required.' }, 422)

    const review = await db.selectFrom('judge_reviews')
      .select(['id', 'user_id', 'anonymized', 'status'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null, anonymized: number | null, status: string } | undefined
    if (!review)
      return response.json({ error: 'Review not found.' }, 404)

    if (review.user_id == null)
      return response.json({ error: 'This review has no account attached to reveal.' }, 404)

    const user = await db.selectFrom('users')
      .select(['id', 'name', 'email'])
      .where('id', '=', Number(review.user_id))
      .executeTakeFirst() as { id: number, name: string | null, email: string | null } | undefined
    if (!user)
      return response.json({ error: 'The account behind this review no longer exists.' }, 404)

    // Logged BEFORE the identity goes out, and NOT best-effort — unlike every
    // other `logModeration` call in this codebase, which is deliberately
    // swallowed so an audit-write failure can't block moderation. Here the
    // audit record is the only thing holding the control up: a reveal that
    // returns the email but fails to write the log is exactly the silent
    // de-anonymization this action exists to prevent. So if the log cannot be
    // written, the reveal does not happen.
    try {
      await db.insertInto('moderation_logs').values({
        actor_user_id: Number(adminId),
        action: 'review.reveal_author',
        target_type: 'review',
        target_id: reviewId,
        note,
        metadata: JSON.stringify({
          // The ref, not the identity. The log says WHICH author was unmasked
          // and by whom; it does not need to restate the email to be useful,
          // and a moderation log that accumulates plaintext identities of
          // anonymous reviewers is its own breach waiting to happen.
          author_ref: authorRef(Number(user.id)),
          anonymized: isAnonymized(review),
          review_status: review.status,
        }),
        uuid: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any).execute()
    }
    catch (err) {
      console.error('[reveal-author] audit write failed — reveal refused.', err instanceof Error ? err.message : err)
      return response.json({ error: 'Could not record this reveal, so it was not performed. Try again.' }, 500)
    }

    return response.json({
      ok: true,
      review_id: reviewId,
      // `anonymized: false` rows were never masked in the first place; the
      // reveal still logs, because asking is what gets recorded, and a
      // moderator should not have to know a row's flag state to use the
      // control.
      was_masked: isAnonymized(review),
      author: {
        id: Number(user.id),
        name: user.name || null,
        email: user.email || null,
      },
    })
  },
})
