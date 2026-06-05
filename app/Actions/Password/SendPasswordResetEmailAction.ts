import { Action } from '@stacksjs/actions'
import { passwordResets } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

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
      try {
        await passwordResets(email).sendEmail()
      }
      catch (err) {
        // Don't leak failure (anti-enumeration) and don't crash — the
        // token is already persisted; the user can retry once mail is configured.
        console.warn('[password-reset] send failed (configure MAIL_* to deliver):', err instanceof Error ? err.message : err)
      }
    }

    return response.json(uniform)
  },
})
