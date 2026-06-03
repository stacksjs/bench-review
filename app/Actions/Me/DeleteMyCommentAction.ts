import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * DELETE /api/me/comments/{id} — author removes their own comment.
 *
 * Hard delete (no soft-delete column). Comments are short and
 * frequent enough that audit-trail value is low. Non-owners get 404
 * in the same shape as a missing row so existence isn't probable
 * from outside.
 *
 * Counter sync: decrements `judge_reviews.comments` to keep the
 * denormalised count consistent. Best-effort — a counter drift of 1
 * is recoverable on the next submit.
 *
 * Resolves bench-review#44 (author-delete).
 */
export default new Action({
  name: 'Delete My Comment',
  description: 'Hard-delete a comment you authored',
  method: 'DELETE',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid comment id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const commentId = Number(request.params?.id)

    const existing = await db.selectFrom('review_comments')
      .select(['id', 'user_id', 'judge_review_id'])
      .where('id', '=', commentId)
      .executeTakeFirst() as { id: number, user_id: number, judge_review_id: number } | undefined

    if (!existing || Number(existing.user_id) !== Number(userId))
      return response.json({ error: 'Comment not found' }, 404)

    await db.deleteFrom('review_comments')
      .where('id', '=', commentId)
      .execute()

    // Counter sync. Decrement clamped at 0 in case the denormalised
    // value already drifted out of sync.
    const reviewRow = await db.selectFrom('judge_reviews')
      .select(['comments'])
      .where('id', '=', existing.judge_review_id)
      .executeTakeFirst() as { comments: number | null } | undefined
    if (reviewRow) {
      await db.updateTable('judge_reviews')
        .set({ comments: Math.max(0, Number(reviewRow.comments ?? 0) - 1) } as any)
        .where('id', '=', existing.judge_review_id)
        .execute()
        .catch(() => {})
    }

    return response.json({ ok: true, deleted: commentId })
  },
})
