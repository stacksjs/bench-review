import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/me/notifications/{id}/read — mark a single notification read.
 *
 * Scoped to the current user — a notification belonging to someone
 * else returns 404 (not 403, so the existence of the row can't be
 * probed). Idempotent: re-marking an already-read row is a no-op.
 */
export default new Action({
  name: 'Mark Notification Read',
  description: 'Mark a single notification as read for the current user',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid notification id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const notificationId = Number(request.params?.id)

    const row = await db.selectFrom('user_notifications')
      .select(['id', 'user_id', 'read_at'])
      .where('id', '=', notificationId)
      .executeTakeFirst() as { id: number, user_id: number, read_at: string | null } | undefined
    if (!row || Number(row.user_id) !== Number(userId))
      return response.json({ error: 'Notification not found' }, 404)

    if (row.read_at == null) {
      await db.updateTable('user_notifications')
        .set({ read_at: new Date().toISOString() } as any)
        .where('id', '=', notificationId)
        .execute()
    }

    return response.json({ ok: true, id: notificationId })
  },
})
