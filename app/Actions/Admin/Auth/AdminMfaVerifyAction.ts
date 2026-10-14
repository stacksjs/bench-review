import { Action } from '@stacksjs/actions'
import { Auth, hasAnyRole } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { verifyAdminLoginCode } from '../../../Helpers/adminMfa'
import { logModeration } from '../../../Helpers/auditLog'
import { bootRbac } from '../../../Helpers/rbac'
import { withSessionCookie } from '../../../Support/sessionCookie'

/**
 * POST /api/admin/auth/mfa — step TWO of admin login (bench-review#56).
 *
 * Takes the opaque challenge from `AdminLoginAction` plus the 6 digits that
 * were emailed, and only now mints a session. Response shape matches what the
 * admin login used to return, so the client's token plumbing is unchanged.
 *
 * The role is checked AGAIN here, not taken on trust from step one. A
 * challenge is a few bytes in a table and the gap between the two requests is
 * ten minutes — long enough for an admin's role to have been revoked in
 * between, which is precisely the window someone removing a compromised
 * moderator cares about.
 *
 * `Auth.loginUsingId` rather than `Auth.login`: the password was verified in
 * step one and is deliberately not held anywhere between the two requests.
 *
 * The session cookie is installed here with `withSessionCookie`, which the
 * admin path was previously missing altogether — admin login returned a bare
 * JSON token while the public login installed an HttpOnly cookie, so an admin
 * session only ever lived in one tab's memory and did not survive a reload.
 */
export default new Action({
  name: 'Admin MFA Verify',
  description: 'Exchange an admin login challenge plus emailed code for a session',
  method: 'POST',

  async handle() {
    bootRbac()

    const challenge = String(request.get?.('challenge') ?? '').trim()
    const code = String(request.get?.('code') ?? '').trim()

    if (!challenge || !code)
      return response.json({ error: 'Enter the code from your email.' }, 422)

    const verdict = await verifyAdminLoginCode(challenge, code)

    if (!verdict.ok) {
      // Distinguishable messages on purpose. Whoever is here already got
      // through the password, so there is no account to enumerate — and
      // telling an admin "that code expired" instead of "wrong code" is the
      // difference between them requesting a new one and them retyping the
      // same dead digits five times.
      const message = verdict.reason === 'expired'
        ? 'That code has expired. Sign in again to get a new one.'
        : verdict.reason === 'used'
          ? 'That code has already been used. Sign in again to get a new one.'
          : verdict.reason === 'locked'
            ? 'Too many incorrect codes. Sign in again to get a new one.'
            : verdict.reason === 'not_found'
              ? 'That sign-in attempt is no longer valid. Sign in again.'
              : 'That code is not right.'
      // 409 rather than 410 for a dead challenge: the framework's response
      // helper only accepts a fixed set of statuses and 410 is not in it.
      const status = verdict.reason === 'wrong_code' ? 401 : 409
      return response.json({ error: message }, status)
    }

    const result = await Auth.loginUsingId(verdict.userId)
    if (!result)
      return response.json({ error: 'Could not start a session. Sign in again.' }, 401)

    const stillAdmin = await hasAnyRole(result.user, ['admin'])
    if (!stillAdmin) {
      await Auth.revokeToken(result.token as any).catch(() => {})
      return response.json({ error: 'This account does not have admin access.' }, 403)
    }

    // An admin signing in is worth a log line of its own. The reveal control
    // records who unmasked whom; this records who was in a position to.
    // Best-effort, unlike the reveal: refusing a correct second factor because
    // an audit insert failed would lock the panel over a logging problem.
    await logModeration({
      actorUserId: Number(result.user?.id),
      action: 'admin.login',
      targetType: 'user',
      targetId: Number(result.user?.id),
      note: 'Password plus emailed code.',
    })

    return withSessionCookie({
      access_token: result.token,
      refresh_token: result.refreshToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      token: result.token,
      user: {
        id: result.user?.id,
        email: result.user?.email,
        name: result.user?.name,
      },
    }, String(result.token))
  },
})
