import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * POST /api/me/notifications/read-all — mark every unread notification
 * for the current user as read in one shot. Powers the "Mark all read"
 * action in the header dropdown and the standalone notifications page.
 */
export default new Action({
  name: 'Mark All Notifications Read',
  description: 'Mark every unread notification for the current user as read',
  method: 'POST',
  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    await db.updateTable('user_notifications')
      .set({ read_at: new Date().toISOString() } as any)
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .execute()

    return response.json({ ok: true })
  },
})
