import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { withClearedSessionCookie } from '../../Support/sessionCookie'

/**
 * Logout — app-local override of the framework default, which revoked the token
 * server-side but left the cookie in the browser for the SPA to clear.
 *
 * That split no longer works: with an `HttpOnly` cookie the SPA physically
 * cannot clear it, so the server has to. Without this the cookie would survive
 * logout and keep being sent — pointing at a revoked token, so requests would
 * fail closed rather than open, but the stale credential would linger in the
 * browser for its full 30-day lifetime.
 *
 * `Auth.logout()` revokes the underlying token, and it finds that token through
 * `requestToken()`, which falls back to the cookie — so this works for a
 * cookie-only client with no `Authorization` header.
 */
export default new Action({
  name: 'LogoutAction',
  description: 'Logout from the application',
  method: 'POST',

  async handle() {
    await Auth.logout()

    return withClearedSessionCookie({
      message: 'Successfully logged out',
    })
  },
})
