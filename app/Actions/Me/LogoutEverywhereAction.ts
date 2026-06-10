import { Action } from '@stacksjs/actions'
import { Auth, revokeAllTokens } from '@stacksjs/auth'
import { response } from '@stacksjs/router'

/**
 * POST /api/me/logout-all — revoke every session for the current user,
 * including the one making this request.
 *
 * The companion to a password change (which keeps the current session
 * and evicts the others via `revokeOtherTokens`). This is the explicit
 * "sign out everywhere" the settings UI can offer for a user who thinks
 * their account is compromised: after this call, every previously issued
 * access and refresh token — on every device — stops working, so the
 * client must log in again.
 */
export default new Action({
  name: 'Logout Everywhere',
  description: 'Revoke all of the current user\'s access and refresh tokens',
  method: 'POST',

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    await revokeAllTokens(Number(userId))

    return response.json({ ok: true })
  },
})
