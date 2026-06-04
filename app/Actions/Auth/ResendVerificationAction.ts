import { Action } from '@stacksjs/actions'
import { Auth, resendVerificationEmail } from '@stacksjs/auth'
import { response } from '@stacksjs/router'

/**
 * POST /api/auth/resend-verification — re-send the verification email to
 * the signed-in user (the "didn't get it?" button on /verify-email).
 *
 * Auth-gated: we resend to whoever is logged in, so no email is taken
 * from the request body (which would let anyone spam arbitrary inboxes).
 * `resendVerificationEmail` short-circuits if the address is already
 * verified.
 */
export default new Action({
  name: 'ResendVerification',
  description: 'Re-send the email-verification link to the signed-in user',
  method: 'POST',

  async handle() {
    const user = await Auth.user()
    if (!user)
      return response.json({ success: false, message: 'Not authenticated.' }, 401)

    const u = user as { id: number, email: string, name?: string, email_verified_at?: string | null }
    const result = await resendVerificationEmail({
      id: u.id,
      email: u.email,
      name: u.name,
      email_verified_at: u.email_verified_at,
    })
    return response.json(result, result.success ? 200 : 422)
  },
})
