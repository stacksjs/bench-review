import { randomBytes } from 'node:crypto'
import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { makeHash } from '@stacksjs/security'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/auth/password/forgot — initiate a password reset.
 *
 * Project-level override of the framework default at
 * `storage/framework/defaults/app/Actions/Password/SendPasswordResetEmailAction.ts`.
 * Two reasons for the override:
 *
 *  1. URL shape. The framework's `passwordResets(email).sendEmail()`
 *     emits `${baseUrl}/password/reset/${token}?email=${email}` — a
 *     path-segment token. Our `resources/views/reset-password.stx`
 *     reads the token as a query param off `/reset-password`. Easier
 *     to build the URL here than to refactor the view + add a
 *     dynamic-route file.
 *
 *  2. Dev visibility. SMTP isn't configured in this environment, so
 *     a `mail.send(...)` would silently fail (or noisily, depending
 *     on the driver). We persist the token, print the reset URL to
 *     the server console, and best-effort-attempt the email send. In
 *     dev: copy the URL from your `./buddy dev` output. In prod with
 *     a real mail driver configured: the user receives the email
 *     normally; the console log is harmless extra logging.
 *
 * Anti-enumeration: returns the SAME success-shaped response for
 * unknown emails as for known ones. The framework default returned
 * 404 for unknown — that lets attackers probe which emails are
 * registered. We swallow that signal here.
 *
 * Token is stored hashed (bcrypt) so a database leak doesn't expose
 * usable reset links. The framework's
 * `passwordResets(email).resetPassword(token, ...)` (which our
 * project's PasswordResetAction route delegates to) verifies via
 * `verifyHash` against the same column — bcrypt-symmetric on both
 * sides, so the existing reset path works unchanged.
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
    const raw = (request as any).get?.('email')
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!email)
      return response.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' })

    const user = await db.selectFrom('users')
      .select(['id'] as any)
      .where('email', '=', email)
      .executeTakeFirst() as { id: number } | undefined

    // Anti-enumeration short-circuit. Return the success-shaped
    // response without persisting a token. Attackers probing for
    // valid emails get the same 200 + same message regardless.
    if (!user)
      return response.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' })

    // Plaintext token goes in the email; only the bcrypt hash hits
    // the DB. randomBytes(32) → 64 hex chars: long enough that
    // brute-forcing a single email's outstanding token in the
    // configured TTL window (60min) is not feasible.
    const token = randomBytes(32).toString('hex')
    const hashedToken = await makeHash(token, { algorithm: 'bcrypt' })

    // Drop any prior outstanding token for this email so a fresh
    // request invalidates older links. The framework's reset code
    // looks up by email and expects at most one row — without this,
    // an attacker who held a stale token could still use it.
    await db.deleteFrom('password_resets')
      .where('email', '=', email)
      .execute()
      .catch(() => {})

    const now = new Date().toISOString()
    await db.insertInto('password_resets').values({
      email,
      token: hashedToken,
      created_at: now,
    } as any).execute()

    // Build URL pointing at our view. Resolve origin from the live
    // request when possible (so a request to a non-localhost host —
    // e.g. a deployed staging — still gets a working link), with a
    // dev-default fallback.
    const reqUrl = (request as any).url
    let baseUrl = process.env.APP_URL || ''
    if (!baseUrl && typeof reqUrl === 'string') {
      try { baseUrl = new URL(reqUrl).origin }
      catch {}
    }
    if (!baseUrl)
      baseUrl = `http://localhost:${process.env.PORT || '4000'}`

    const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

    // Dev visibility. Loud, parseable, and easy to copy from the
    // tail of `./buddy dev`. Production with a real mail driver
    // wired up doesn't need this, but logging the link is harmless
    // (it's already going to the user's inbox via the email).
    console.log('\n[password-reset]')
    console.log(`  email : ${email}`)
    console.log(`  token : ${token.slice(0, 8)}…`)
    console.log(`  link  : ${resetUrl}`)
    console.log('  (link expires in 60 minutes)\n')

    // Best-effort mail send. If the email driver throws (SMTP
    // unconfigured, log driver missing the views, etc.) we swallow
    // and rely on the console log above. The token is already in
    // the DB; the user can still complete the flow if they have the
    // URL.
    try {
      const { mail } = await import('@stacksjs/email')
      await mail.send({
        to: email,
        subject: 'Reset your Bench Review password',
        text: `Hi,\n\nReset your password using the link below. It expires in 60 minutes.\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n`,
        html: `<p>Hi,</p><p>Reset your password using the link below. It expires in 60 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      })
    }
    catch (err) {
      console.warn('[password-reset] mail.send failed — falling back to console-only link. Configure MAIL_DRIVER in config/email.ts to fix.', err instanceof Error ? err.message : err)
    }

    return response.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' })
  },
})
