import { Action } from '@stacksjs/actions'
import { passwordResets } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { reportError } from '../../Support/reportError'

/**
 * POST /api/auth/password/forgot — send a password-reset link.
 *
 * Thin wrapper over the framework's `passwordResets(email).sendEmail()`,
 * which now bakes in everything this action used to hand-roll (138 lines →
 * this): token generation + bcrypt hashing + single-outstanding-token
 * rotation, the `password-reset` email with a plain-text fallback, AND
 * anti-enumeration — it silently no-ops for unknown emails (no token row,
 * no send). The reset-link route is configured in `config/auth.ts`
 * (`passwordReset.url`) to point at our `/reset-password?token=…&email=…`
 * page, so we don't have to build the URL by hand.
 *
 * We always return the same success-shaped response whether or not the
 * email is registered, so the endpoint can't enumerate accounts. A
 * mail-driver failure is swallowed for the same reason (and because the
 * token is already persisted) — configure `MAIL_*` to actually deliver.
 */
export default new Action({
  name: 'SendPasswordResetEmailAction',
  description: 'Send Password Reset Email',
  method: 'POST',
  validations: {
    email: {
      rule: schema.string().email(),
      message: 'Email must be a valid email address.',
    },
  },

  async handle() {
    const raw = request.get?.('email')
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    const uniform = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' }

    if (email) {
      // NOT awaited (bench-review#55). The response body is deliberately
      // identical whether or not an account exists — but awaiting the send
      // made the response TIME depend on whether one happened, since
      // `sendEmail()` returns immediately for an unknown address and talks to
      // SMTP for a known one. The uniform message said nothing while the clock
      // said everything, which is the same enumeration oracle in a slower
      // disguise.
      //
      // Detaching also means a dead mail server cannot hold this endpoint open
      // for the driver's full timeout. Failures are reported rather than
      // surfaced: the token is already persisted, so a retry works once mail
      // is configured.
      void passwordResets(email).sendEmail().catch((err: unknown) => {
        reportError('mail.password-reset', err)
      })
    }

    return response.json(uniform)
  },
})
