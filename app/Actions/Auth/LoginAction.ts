import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Auth, createTwoFactorChallenge, getTwoFactorState } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
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
 * Two behavioural differences from the default. The session token is also
 * returned as an `HttpOnly` cookie instead of being left for the browser to
 * write via `document.cookie` (see `app/Support/sessionCookie.ts` for why),
 * and a suspended account is refused a token at all (bench-review#49).
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

    // Suspended accounts get no token. app/Middleware/Auth.ts already refuses
    // every auth-gated request from a banned user, so the door was shut —
    // but login itself still succeeded, which left a suspended person with a
    // session that failed on the next click and no idea why.
    //
    // Says so plainly rather than returning the generic credential error.
    // This point is only reachable with a CORRECT password, so naming the
    // suspension reveals nothing an attacker could not already infer, and
    // the alternative tells someone who typed their password correctly that
    // they got it wrong — inviting them to retry forever.
    //
    // Matches the middleware's status and wording so the two paths cannot
    // drift into telling the same user different stories.
    //
    // Read straight off the table rather than from the model row:
    // `banned_at` is written by SuspendUserAction through `db.updateTable`
    // and is declared on neither app/Models/User.ts nor the generated row
    // types, so trusting the model to carry it would risk a check that
    // silently never fires. app/Middleware/Auth.ts queries it the same way.
    const suspension = await db.selectFrom('users')
      .select(['banned_at'])
      .where('id', '=', Number(authedUser.id))
      .executeTakeFirst() as { banned_at: string | null } | undefined
    if (suspension?.banned_at)
      return response.json({ message: 'This account has been suspended. Contact support if you believe this is a mistake.' }, 403)

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
