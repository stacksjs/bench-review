import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Auth, register } from '@stacksjs/auth'
import { dispatch } from '@stacksjs/events'
import { response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { withSessionCookie } from '../../Support/sessionCookie'

/**
 * Register — app-local override of the framework default, identical except that
 * the new session arrives as an `HttpOnly` cookie rather than being written by
 * the browser. See `app/Support/sessionCookie.ts`.
 *
 * Registration logs the user straight in, so it mints a session and therefore
 * needs the same cookie treatment as login; without it a freshly registered
 * user would be the one remaining path that persisted a script-readable token.
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
