import { Action } from '@stacksjs/actions'
import { Auth, hasAnyRole } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { bootRbac } from '../../../Helpers/rbac'

/**
 * POST /api/admin/auth/login — admin-only login.
 *
 * Mirrors the default LoginAction's response shape so the existing
 * `useStore('auth')` token plumbing on the client can consume it
 * unchanged. The only behavioural difference is the role gate AFTER
 * credentials are verified: a non-admin who knows their password
 * gets a 403, not a token.
 *
 * Why we issue-then-revoke rather than gate-then-issue:
 *   `Auth.login()` is the single integration point that actually
 *   verifies the password (via the framework's hash provider). We
 *   reuse it rather than duplicating the comparison. Revoking the
 *   freshly-issued single token (NOT `revokeAllTokens` — that would
 *   nuke the user's sessions on other surfaces) keeps the side-effect
 *   minimal: a non-admin gets a 403 with no usable credential left
 *   behind from this request.
 */
export default new Action({
  name: 'Admin Login',
  description: 'Authenticate an admin user and issue a bearer token',
  method: 'POST',
  validations: {
    email: {
      rule: schema.string().email(),
      message: 'Email must be a valid email address.',
    },
    password: {
      rule: schema.string().min(6).max(255),
      message: 'Password must be between 6 and 255 characters.',
    },
  },

  async handle() {
    bootRbac()

    const email = String((request as any).get?.('email') ?? '')
    const password = String((request as any).get?.('password') ?? '')

    const result = await Auth.login({ email, password })
    if (!result)
      return response.json({ error: 'Incorrect email or password' }, 401)

    const isAdmin = await hasAnyRole(result.user, ['admin'])
    if (!isAdmin) {
      await Auth.revokeToken(result.token as any).catch(() => {})
      return response.json({ error: 'This account does not have admin access.' }, 403)
    }

    return response.json({
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
    })
  },
})
