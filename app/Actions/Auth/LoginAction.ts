import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Auth, createTwoFactorChallenge, getTwoFactorState } from '@stacksjs/auth'
import { User } from '@stacksjs/orm'
import { response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { withSessionCookie } from '../../Support/sessionCookie'

/**
 * Login — app-local override of `storage/framework/defaults/app/Actions/Auth/LoginAction.ts`.
 *
 * Actions resolve `app/` first and fall back to the framework defaults (the
 * same mechanism noted in `routes/api.ts`), so this file wins without touching
 * the vendored tree — which matters because `storage/framework/` is replaced
 * wholesale on a framework sync.
 *
 * The ONLY behavioural difference from the default is that the session token is
 * also returned as an `HttpOnly` cookie instead of being left for the browser
 * to write via `document.cookie`. See `app/Support/sessionCookie.ts` for why.
 *
 * The JSON body is kept byte-compatible with the framework's shape
 * (`access_token` / `refresh_token` / `token_type` / `expires_in` / the legacy
 * `token` / `user`) so any non-browser client keeps working, and so a future
 * framework sync does not silently change the contract underneath the SPA.
 *
 * NOTE on 2FA: the `requires_two_factor` branch mints no token, so it sets no
 * cookie — correct, since no session exists until the code is verified. The
 * token for that path comes from `VerifyTwoFactorLoginAction`, which this app
 * does not route (`routes/api.ts` declares no 2FA verify endpoint), so a 2FA
 * account cannot complete login here. That is pre-existing, not introduced
 * here; wire that route and give it the same cookie treatment if 2FA is turned on.
 */
export default new Action({
  name: 'LoginAction',
  description: 'Login to the application',
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

  async handle(request: RequestInstance) {
    const email = request.get('email')
    const password = request.get('password')

    // Verify credentials WITHOUT minting tokens yet — if the account has TOTP
    // 2FA enabled, no token pack should exist until the code is also verified.
    const isValid = await Auth.attempt({ email, password })
    if (!isValid)
      return response.unauthorized('Incorrect email or password')

    const authedUser = await User.where('email', '=', email).first()
    if (!authedUser)
      return response.unauthorized('Incorrect email or password')

    const { enabled: twoFactorEnabled } = await getTwoFactorState(authedUser.id as number)
    if (twoFactorEnabled) {
      const challengeToken = await createTwoFactorChallenge(authedUser.id as number)
      return response.json({
        requires_two_factor: true,
        challenge_token: challengeToken,
      })
    }

    const result = await Auth.loginUsingId(authedUser.id as number)
    if (!result)
      return response.unauthorized('Incorrect email or password')

    const user = result.user

    return withSessionCookie({
      access_token: result.token,
      refresh_token: result.refreshToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      token: result.token,
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
      },
    }, result.token)
  },
})
