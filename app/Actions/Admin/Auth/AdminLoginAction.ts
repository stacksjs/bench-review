import { Action } from '@stacksjs/actions'
import { Auth, hasAnyRole } from '@stacksjs/auth'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { ADMIN_MFA_TTL_SECONDS, issueAdminLoginCode, mayLogCodeToConsole, maskEmail } from '../../../Helpers/adminMfa'
import { bootRbac } from '../../../Helpers/rbac'

/**
 * POST /api/admin/auth/login — step ONE of admin login (bench-review#56).
 *
 * A correct admin password no longer produces a session. It produces a
 * challenge, and a 6-digit code goes to the address on the account;
 * `AdminMfaVerifyAction` turns the two into a token.
 *
 * Why the admin panel in particular: it is the surface where a moderator can
 * see which real person wrote an anonymous review of a named judge. A single
 * reused or phished password used to be the entire control standing between
 * an attacker and that, and nothing about reading the queue is an event that
 * leaves a trace. The password is still necessary — it is just no longer
 * sufficient.
 *
 * The role gate still runs AFTER the credential check, so a non-admin who
 * knows their password gets a 403 and never learns whether a second factor
 * would have been asked for.
 *
 * Why we issue-then-revoke rather than gate-then-issue:
 *   `Auth.login()` is the single integration point that actually verifies the
 *   password (via the framework's hash provider). We reuse it rather than
 *   duplicating the comparison. The freshly-issued token is then revoked in
 *   BOTH exit paths — the 403 and the MFA handoff — because neither is
 *   supposed to leave a usable credential behind. (Not `revokeAllTokens`:
 *   that would nuke the user's sessions on other surfaces.)
 */
export default new Action({
  name: 'Admin Login',
  description: 'Verify admin credentials and email a second-factor code',
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

  async handle() {
    bootRbac()

    const email = String(request.get?.('email') ?? '')
    const password = String(request.get?.('password') ?? '')

    const result = await Auth.login({ email, password })
    if (!result)
      return response.json({ error: 'Incorrect email or password' }, 401)

    const isAdmin = await hasAnyRole(result.user, ['admin'])
    if (!isAdmin) {
      await Auth.revokeToken(result.token as any).catch(() => {})
      return response.json({ error: 'This account does not have admin access.' }, 403)
    }

    // The password checked out, so this request is done issuing credentials —
    // the token minted by `Auth.login()` above must not reach the client. It
    // goes the same way the non-admin one does.
    await Auth.revokeToken(result.token as any).catch(() => {})

    const adminId = Number(result.user?.id)
    const adminEmail = String(result.user?.email ?? '')
    if (!adminId || !adminEmail) {
      // An admin row with no id or no address cannot be sent a code, and
      // falling back to "let them in" would make the factor optional in
      // exactly the case where something is already wrong.
      console.error('[admin-login] admin has no id/email — cannot issue a second factor.')
      return response.json({ error: 'This account cannot complete the security check. Contact the site owner.' }, 500)
    }

    const issued = await issueAdminLoginCode(adminId)

    try {
      const { mail } = await import('@stacksjs/email')
      await mail.send({
        to: adminEmail,
        subject: `Your Bench Review admin code: ${issued.code}`,
        // The code is in the subject as well as the body so it is readable
        // from a notification without opening the mail.
        text: `Your admin sign-in code is ${issued.code}\n\nIt expires in ${Math.round(ADMIN_MFA_TTL_SECONDS / 60)} minutes and can only be used once.\n\nIf you did not just try to sign in to the Bench Review admin panel, someone has your password. Change it now.\n\n— Bench Review\n`,
      })
    }
    catch (err) {
      console.warn('[admin-login] could not email the login code.', err instanceof Error ? err.message : err)
      if (mayLogCodeToConsole()) {
        // Local development usually has no SMTP, and an admin panel that
        // cannot be logged into locally is an admin panel that stops being
        // tested. Never reachable in production — see `mayLogCodeToConsole`.
        console.warn(`[admin-login] DEV ONLY — login code for ${adminEmail} is ${issued.code}`)
      }
      else {
        // Fail CLOSED. A code nobody received is not a factor that was
        // satisfied, and handing out a session because the mailer is down
        // would make the control evaporate exactly when the site is already
        // having a bad day.
        return response.json({ error: 'Could not send your login code. Try again shortly.' }, 503)
      }
    }

    return response.json({
      mfa_required: true,
      challenge: issued.challenge,
      sent_to: maskEmail(adminEmail),
      expires_in: ADMIN_MFA_TTL_SECONDS,
    })
  },
})
