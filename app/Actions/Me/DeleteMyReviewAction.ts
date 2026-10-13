import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { deleteReviewCascade } from '../../Helpers/reviewCascade'

/**
 * DELETE /api/me/reviews/{id} — author removes their own review.
 *
 * Permitted on ANY status (pending / rejected / published) — the
 * author is in charge of their own content. Cascades the same way as
 * the admin delete, through the shared helper: likes, comments, photos,
 * flags, the judge's response, the review's notifications, and the row.
 *
 * Non-owners get 404 (response indistinguishable from a missing row).
 */
export default new Action({
  name: 'Delete My Review',
  description: 'Hard-delete a review you authored, cascading like/notification rows',
  method: 'DELETE',
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
      .select(['id', 'user_id'])
      .where('id', '=', reviewId)
      .executeTakeFirst() as { id: number, user_id: number | null } | undefined

    if (!existing || existing.user_id == null || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Review not found' }, 404)

    // Shared cascade (bench-review#52). This list used to be inline here and
    // in the admin DeleteReviewAction, and both copies omitted
    // `judge_responses`.
    //
    // The comment that stood here said SQLite had no FK constraints on these
    // tables so an app-level cascade was the only cleanup. That stopped being
    // true when the FK repair pass ran: every child table now holds a real
    // foreign key with ON DELETE NO ACTION, and they are enforced. The missing
    // table was therefore not an orphan-row problem but a hard block — a
    // review a judge had replied to could not be deleted at all.
    //
    // (Photo FILES on disk are still not removed here — a separate
    // storage-sweep concern; only the rows go.)
    await deleteReviewCascade(reviewId)

    return response.json({ ok: true, deleted: reviewId })
  },
})
