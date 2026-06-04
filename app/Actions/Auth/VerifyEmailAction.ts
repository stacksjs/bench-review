import { Action } from '@stacksjs/actions'
import { verifyEmail } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'

/**
 * POST /api/auth/verify-email — confirm a user's email from the link in
 * their verification email.
 *
 * The link is `/verify-email/{id}/{token}` (built by the framework's
 * `sendVerificationEmail`); the page parses both out of the path and
 * POSTs them here. Both are required: the stored token is an HMAC keyed
 * by user id, so verification can't be done from the token alone.
 *
 * Unauthenticated on purpose — the token IS the proof, and the link is
 * often opened in a fresh browser / mail client with no session.
 */
export default new Action({
  name: 'VerifyEmail',
  description: 'Verify a user email address via the emailed token',
  method: 'POST',

  async handle() {
    const body = request.all() as { userId?: unknown, token?: unknown }
    const userId = Number(body.userId)
    const token = String(body.token ?? '')

    if (!Number.isFinite(userId) || userId <= 0 || !token)
      return response.json({ success: false, message: 'Invalid verification link.' }, 400)

    const result = await verifyEmail(userId, token)
    return response.json(result, result.success ? 200 : 400)
  },
})
