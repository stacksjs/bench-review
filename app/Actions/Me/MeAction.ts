import { Action } from '@stacksjs/actions'
import { Auth, getUserRoles } from '@stacksjs/auth'
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

    return response.json({
      id: userId,
      email: user.email,
      name: user.name,
      roles: roles.map(r => r.name),
    })
  },
})
