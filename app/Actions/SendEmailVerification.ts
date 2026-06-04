import { Action } from '@stacksjs/actions'
import { sendVerificationEmail } from '@stacksjs/auth'
import { log } from '@stacksjs/logging'

/**
 * `user:registered` listener — emails a verification link to a newly
 * registered user (bench launch trust gate).
 *
 * Runs alongside SendWelcomeEmail off the same event (see app/Events.ts).
 * Uses the framework's `sendVerificationEmail` (@stacksjs/auth): it
 * generates a token, stores its hash in `email_verifications`, and mails
 * the `/verify-email/{id}/{token}` link (plain-text fallback if no
 * template). Review submission is gated on the resulting
 * `users.email_verified_at` (SubmitReviewAction).
 *
 * Deliberately non-fatal: a missing `email_verifications` table (auth
 * not yet set up) or an SMTP hiccup must NEVER break registration — the
 * user lands logged-in and can re-trigger from the /verify-email page's
 * resend button.
 */
export interface RegisteredPayload {
  id?: number
  email?: string
  name?: string
  to?: string
}

export default new Action({
  name: 'SendEmailVerification',
  description: 'Emails a verification link to a newly registered user',

  // NOTE: like its sibling SendWelcomeEmail, this is an event listener —
  // `handle` receives the `user:registered` payload, not a request. The
  // Action type only models request handlers, so tsc flags the signature
  // (a known framework listener-typing gap, identical on SendWelcomeEmail).
  async handle({ id, email, name }: RegisteredPayload) {
    if (!id || !email)
      return { success: false, message: 'Registration payload missing id/email.' }

    try {
      await sendVerificationEmail({ id, email, name })
      return { success: true, message: `Verification email queued for ${email}.` }
    }
    catch (err) {
      log.warn(`[email-verification] send failed for user ${id}: ${err instanceof Error ? err.message : String(err)}`)
      return { success: false, message: 'Verification email failed (non-fatal).' }
    }
  },
})
