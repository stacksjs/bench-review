import { Action } from '@stacksjs/actions'
import { Auth, getUserRoles } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'
import { bootRbac } from '../../Helpers/rbac'

/**
 * GET /api/me — minimal "who am I" payload for the SPA shell.
 *
 * Returns the authenticated user's identity plus their role names so
 * the header can decide whether to render the "Admin" link without a
 * second round-trip. Anonymous requests get 401 (the route is
 * auth-gated; this guard is defence-in-depth).
 *
 * The roles array is small (typically 0-2 entries: 'client', maybe
 * 'admin'), so flattening to names rather than full role objects
 * keeps the payload tight.
 */
export default new Action({
  name: 'Me',
  description: 'Current authenticated user identity + role names',
  method: 'GET',
  async handle() {
    bootRbac()

    const user = await Auth.user()
    if (!user)
      return response.json({ error: 'Not authenticated' }, 401)

    const userId = user.id
    const roles = await getUserRoles(userId)

    // Read avatar straight from the column so a reload reflects the
    // stored photo regardless of whether Auth.user()'s model projection
    // includes it (UploadAvatarAction writes users.avatar directly).
    const row = await db.selectFrom('users')
      .select(['avatar'])
      .where('id', '=', Number(userId))
      .executeTakeFirst() as { avatar: string | null } | undefined

    return response.json({
      id: userId,
      email: user.email,
      name: user.name,
      avatar: row?.avatar ?? (user as any).avatar ?? null,
      roles: roles.map((r: { name: string }) => r.name),
    })
  },
})
