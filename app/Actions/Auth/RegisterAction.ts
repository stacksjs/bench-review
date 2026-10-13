import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Auth, register } from '@stacksjs/auth'
import { dispatch } from '@stacksjs/events'
import { response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { isDisposableEmail } from '../../Helpers/disposableEmail'
import { verifyTurnstile } from '../../Helpers/turnstile'
import { withSessionCookie } from '../../Support/sessionCookie'

/**
 * Register — app-local override of the framework default, identical except that
 * the new session arrives as an `HttpOnly` cookie rather than being written by
 * the browser. See `app/Support/sessionCookie.ts`.
 *
 * Registration logs the user straight in, so it mints a session and therefore
 * needs the same cookie treatment as login; without it a freshly registered
 * user would be the one remaining path that persisted a script-readable token.
 *
 * Two abuse checks run AHEAD of register() (bench-review#51). Until now the
 * only guard was `throttle:5,10m` on the route, so scripted signups were a
 * matter of rotating IPs — and on a site that publishes reviews of named,
 * sitting judges, cheap verified accounts are the raw material for harassment
 * and impersonation.
 *
 *   1. a disposable-inbox check, which is local and free
 *   2. Cloudflare Turnstile, which costs a round trip
 *
 * In that order on purpose: no reason to ask Cloudflare about a signup we are
 * going to refuse anyway.
 */
export default new Action({
  name: 'RegisterAction',
  description: 'Register a new user',
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
    name: {
      rule: schema.string().min(2).max(255),
      message: 'Name must be between 2 and 255 characters.',
    },
  },

  async handle(request: RequestInstance) {
    const email = request.get('email')
    const password = request.get('password')
    const name = request.get('name')

    // Cheap and local first.
    if (isDisposableEmail(email)) {
      return response.json({
        message: 'Please sign up with a permanent email address — reviews are tied to a verifiable account.',
      }, 422)
    }

    // `cf-turnstile-response` is the field name Turnstile's own widget writes
    // into the form; `turnstileToken` is what this app's store sends. Accept
    // both so the check does not depend on how the page submitted.
    const token = String(request.get('turnstileToken') ?? request.get('cf-turnstile-response') ?? '')
    const verdict = await verifyTurnstile(token)
    if (!verdict.ok) {
      // Separated because they are different situations for the person in
      // front of the form. 'unreachable' is our problem and retrying works;
      // the others mean the check did not pass.
      if (verdict.reason === 'unreachable') {
        return response.json({
          message: 'We could not complete the security check just now. Please try again in a moment.',
        }, 503)
      }
      if (verdict.reason === 'rejected')
        console.warn('[register] turnstile rejected a signup:', verdict.codes?.join(', ') || '(no codes)')
      return response.json({
        message: 'Please complete the security check and try again.',
      }, 422)
    }

    const result = await register({ email, password, name })

    if (result) {
      const user = await Auth.getUserFromToken(result.token)

      // Fire `user:registered` so app/Events.ts listeners (welcome email, CRM
      // sync, etc.) run. Fire-and-forget — listener errors are caught by the
      // wildcard handler so a flaky welcome email doesn't fail registration.
      dispatch('user:registered', {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        to: user?.email,
      })

      return withSessionCookie({
        token: result.token,
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.name,
        },
      }, result.token)
    }

    return response.error('Registration failed')
  },
})
