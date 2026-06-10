import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'

/**
 * POST /api/admin/flags/{id}/resolve — close out a flag.
 *
 * Body: `action: 'dismiss' | 'resolve'`, optional `note`.
 *   - dismiss: the flag was not actionable (status -> 'dismissed').
 *   - resolve: the flag was acted on (status -> 'resolved'); the review
 *     itself is taken down separately via the review-status / delete
 *     endpoints.
 *
 * Either way the moderator + note are stamped on the flag and the action
 * is written to the audit log. This gives flags the lifecycle the schema
 * already had columns for but no endpoint to drive.
 */
export default new Action({
  name: 'Admin Resolve Flag',
  description: 'Dismiss or resolve a review flag',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid flag id.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const adminId = (me as any)?.id
    if (!adminId)
      return response.json({ error: 'Not authenticated' }, 401)

    const flagId = Number(request.params?.id)
    const action = String(request.get?.('action') ?? '').trim().toLowerCase()
    if (action !== 'dismiss' && action !== 'resolve')
      return response.json({ error: 'action must be "dismiss" or "resolve".' }, 422)

    const flag = await db.selectFrom('review_flags')
      .select(['id', 'status', 'judge_review_id'])
      .where('id', '=', flagId)
      .executeTakeFirst() as { id: number, status: string, judge_review_id: number | null } | undefined
    if (!flag)
      return response.json({ error: 'Flag not found.' }, 404)
    if (flag.status !== 'open')
      return response.json({ error: `Flag already ${flag.status}.` }, 422)

    const note = String(request.get?.('note') ?? '').trim().slice(0, 1000) || null
    const nextStatus = action === 'resolve' ? 'resolved' : 'dismissed'
    const now = new Date().toISOString()

    await db.updateTable('review_flags')
      .set({ status: nextStatus, moderator_id: Number(adminId), moderator_note: note, updated_at: now } as any)
      .where('id', '=', flagId)
      .execute()

    await logModeration({
      actorUserId: Number(adminId),
      action: action === 'resolve' ? 'flag.resolve' : 'flag.dismiss',
      targetType: 'review',
      targetId: flag.judge_review_id != null ? Number(flag.judge_review_id) : null,
      note: note ?? undefined,
    })

    return response.json({ ok: true, status: nextStatus })
  },
})
