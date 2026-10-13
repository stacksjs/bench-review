import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'
import { recountReviewComments } from '../../../Helpers/commentCount'

/**
 * PATCH /api/admin/comments/{id} — take a comment down, or put it back.
 *
 * Comments auto-publish, which is right for the back-and-forth they exist
 * for, but it left a platform that hosts criticism of named judges with no
 * way to remove a single abusive reply short of editing the database by
 * hand. A review could be unpublished wholesale; one comment under it could
 * not be touched (bench-review#51).
 *
 * Soft, not a delete. The comment row stays with `status = 'rejected'`, so
 * the thing a moderator acted on is still there to look at if the decision
 * is questioned later — which on this platform it will be. Hard deletion
 * destroys the evidence trail (#53), and the author's own
 * DELETE /api/me/comments/{id} remains the only path that truly removes a
 * row.
 *
 * Reversible: passing `published` restores it, because moderation mistakes
 * happen and an irreversible tool makes moderators hesitant rather than
 * careful.
 *
 * Keeps `judge_reviews.comments` in step. That counter is denormalised so
 * card lists need no COUNT, and the public thread only renders published
 * rows — leaving it alone would advertise replies that cannot be read.
 */
const STATUSES = new Set(['published', 'rejected'])

export default new Action({
  name: 'Admin Update Comment Status',
  description: 'Publish or reject a single comment',
  method: 'PATCH',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid comment id.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const adminId = (me as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated' }, 401)

    const commentId = Number(request.params?.id)
    if (!Number.isFinite(commentId) || commentId <= 0)
      return response.json({ error: 'Invalid comment id.' }, 422)

    const status = String(request.get?.('status') ?? '').trim().toLowerCase()
    if (!STATUSES.has(status))
      return response.json({ error: 'status must be "published" or "rejected".' }, 422)

    const note = String(request.get?.('note') ?? '').trim().slice(0, 500)

    const existing = await db.selectFrom('review_comments')
      .select(['id', 'status', 'judge_review_id'])
      .where('id', '=', commentId)
      .executeTakeFirst() as { id: number, status: string, judge_review_id: number | null } | undefined
    if (!existing)
      return response.json({ error: 'Comment not found' }, 404)

    // Nothing to do, and nothing to log — re-sending the current status
    // should not write a second audit entry suggesting a second decision.
    if (existing.status === status)
      return response.json({ ok: true, id: commentId, status, unchanged: true })

    const now = new Date().toISOString()
    await db.updateTable('review_comments')
      .set({ status, updated_at: now } as any)
      .where('id', '=', commentId)
      .execute()

    // Counter sync, best-effort: the status change is the decision and must
    // stand even if the counter write fails. Recounted rather than nudged by
    // one, so a counter that has already drifted gets corrected here instead
    // of drifting further.
    if (existing.judge_review_id != null) {
      try {
        await recountReviewComments(Number(existing.judge_review_id))
      }
      catch (err) {
        console.warn(`[admin-comment-status] counter resync failed for review ${existing.judge_review_id}:`, err instanceof Error ? err.message : err)
      }
    }

    await logModeration({
      actorUserId: Number(adminId),
      action: status === 'rejected' ? 'comment.reject' : 'comment.publish',
      targetType: 'review_comment',
      targetId: commentId,
      note: note || null,
    })

    return response.json({ ok: true, id: commentId, status })
  },
})
