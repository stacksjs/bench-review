import { Auth, hasAnyRole } from '@stacksjs/auth'
import { HttpError } from '@stacksjs/error-handling'
import { Middleware } from '@stacksjs/router'
import { bootRbac } from '../Helpers/rbac'

/**
 * Admin Middleware
 *
 * Stops every request that isn't from a user with the `admin` role.
 *
 * Why we don't use the framework's `Role.ts` middleware:
 *
 *   The shipped middleware (storage/framework/defaults/app/Middleware/Role.ts:27)
 *   reads `request.user || request._user` — but the project's own
 *   `app/Middleware/Auth.ts` only *validates* the bearer token, it never
 *   stamps a user onto the request. Composing `role:admin` after `auth`
 *   would 401 every admin request as "Unauthenticated."
 *
 *   Rather than rewire Auth (which would touch every other route's
 *   auth path), this middleware resolves the user itself via
 *   `Auth.user()` — the same call the project's existing actions
 *   (`FollowJudgeAction`, `SubmitReviewAction`, etc.) already use.
 *
 * Must chain AFTER `.middleware('auth')` so the request has already
 * been validated as authenticated when we get here. We re-check `user`
 * defensively in case the route forgot the auth middleware.
 */
export default new Middleware({
  name: 'admin',
  priority: 4,

  async handle() {
    bootRbac()

    const user = await Auth.user()
    if (!user) {
      throw new HttpError(401, 'Unauthenticated.')
    }

    const isAdmin = await hasAnyRole(user, ['admin'])
    if (!isAdmin) {
      throw new HttpError(403, 'Admin role required.')
    }
  },
})
