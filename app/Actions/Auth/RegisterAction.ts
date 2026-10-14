import type { RequestInstance } from '@stacksjs/types'
import { Action } from '@stacksjs/actions'
import { Auth, register } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { dispatch } from '@stacksjs/events'
import { response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { isUniqueViolation } from '../../Helpers/dbErrors'
import { isDisposableEmail } from '../../Helpers/disposableEmail'
import { verifyTurnstile } from '../../Helpers/turnstile'
import { withSessionCookie } from '../../Support/sessionCookie'

/**
 * Register — app-local override of the framework default, identical except that
 * the new session arrives as an `HttpOnly` cookie rather than being written by
 * the browser. See `app/Support/sessionCookie.ts`.
 *
 * Registration logs the user straight in, so it mints a session and therefore
 * needs the same cookie treatment as login; without it a freshly registered
 * user would be the one remaining path that persisted a script-readable token.
 *
 * Two abuse checks run AHEAD of register() (bench-review#51). Until now the
 * only guard was `throttle:5,10m` on the route, so scripted signups were a
 * matter of rotating IPs — and on a site that publishes reviews of named,
 * sitting judges, cheap verified accounts are the raw material for harassment
 * and impersonation.
 *
 *   1. a disposable-inbox check, which is local and free
 *   2. Cloudflare Turnstile, which costs a round trip
 *
 * In that order on purpose: no reason to ask Cloudflare about a signup we are
 * going to refuse anyway.
 *
 * Registration also requires explicit agreement to the Terms and confirmation
 * of being 18 or over, stamped on the row (bench-review#54). The site used to
 * rely on browsewrap — terms.stx asserting that use implies agreement — which
 * courts routinely decline to enforce, and the clauses that matter here are
 * the content licence, the content standards and the liability cap.
 */
export default new Action({
  name: 'RegisterAction',
  description: 'Register a new user',
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
    name: {
      rule: schema.string().min(2).max(255),
      message: 'Name must be between 2 and 255 characters.',
    },
  },

  async handle(request: RequestInstance) {
    const email = request.get('email')
    const password = request.get('password')
    const name = request.get('name')

    // Checked server-side, not merely in the form. A checkbox the browser
    // enforces is a checkbox a scripted signup never sees.
    const acceptedTerms = request.get('terms_accepted')
    const accepted = acceptedTerms === true || acceptedTerms === 'true' || acceptedTerms === 1 || acceptedTerms === '1' || acceptedTerms === 'on'
    if (!accepted) {
      return response.json({
        message: 'Please confirm you are 18 or older and agree to the Terms of Service and Privacy Policy.',
      }, 422)
    }

    // Cheap and local first.
    if (isDisposableEmail(email)) {
      return response.json({
        message: 'Please sign up with a permanent email address — reviews are tied to a verifiable account.',
      }, 422)
    }

    // `cf-turnstile-response` is the field name Turnstile's own widget writes
    // into the form; `turnstileToken` is what this app's store sends. Accept
    // both so the check does not depend on how the page submitted.
    const token = String(request.get('turnstileToken') ?? request.get('cf-turnstile-response') ?? '')
    const verdict = await verifyTurnstile(token)
    if (!verdict.ok) {
      // Separated because they are different situations for the person in
      // front of the form. 'unreachable' is our problem and retrying works;
      // the others mean the check did not pass.
      if (verdict.reason === 'unreachable') {
        return response.json({
          message: 'We could not complete the security check just now. Please try again in a moment.',
        }, 503)
      }
      if (verdict.reason === 'rejected')
        console.warn('[register] turnstile rejected a signup:', verdict.codes?.join(', ') || '(no codes)')
      return response.json({
        message: 'Please complete the security check and try again.',
      }, 422)
    }

    // `users.email` carries a UNIQUE index, so a second signup with the same
    // address loses at the database rather than quietly creating a duplicate
    // account (bench-review#52). Deliberately not a check-then-insert: that
    // has a race, and the index is the real guard. This reads the loss.
    //
    // The response must NOT say that the address is taken (bench-review#56).
    // Login and password reset are both uniform, which left registration as
    // the only auth surface that answered "does this person have an account
    // here" — and on a site publishing anonymous criticism of named, sitting
    // judges, confirming that a particular clerk or lawyer holds an account is
    // the first half of unmasking them. It used to answer with a 409 and
    // "An account with that email already exists. Try signing in instead."
    //
    // `register()` itself now returns a generic 422 for a duplicate and hashes
    // the password BEFORE it looks, so neither the body nor the response time
    // distinguishes the two cases (stacksjs/stacks#1953). This catch exists so
    // that a constraint error escaping by some other route — a second unique
    // index, a driver that reports the violation differently — cannot widen
    // again what the framework narrowed. Same status and wording, so the two
    // paths stay indistinguishable.
    //
    // Someone who genuinely owns the address and forgot is not left stuck:
    // password reset is uniform too, and tells them out of band.
    let result: Awaited<ReturnType<typeof register>>
    try {
      result = await register({ email, password, name })
    }
    catch (err) {
      if (isUniqueViolation(err)) {
        return response.json({
          message: 'Registration could not be completed. Please check your details and try again.',
        }, 422)
      }
      throw err
    }

    if (result) {
      const user = await Auth.getUserFromToken(result.token)

      // Stamp WHEN they agreed, not that they did: the Terms change, and what
      // a dispute turns on is which version was in front of them. Written
      // after the account exists, and best-effort — a failed stamp must not
      // leave someone with no account after a successful registration. It is
      // recoverable (the column is nullable and means "never asked"); an
      // account that silently did not get created is not.
      if (user?.id) {
        await db.updateTable('users')
          .set({ terms_accepted_at: new Date().toISOString() } as any)
          .where('id', '=', Number(user.id))
          .execute()
          .catch((err: unknown) => {
            console.warn(`[register] could not stamp terms acceptance for user ${user.id}:`, err instanceof Error ? err.message : err)
          })
      }

      // Fire `user:registered` so app/Events.ts listeners (welcome email, CRM
      // sync, etc.) run. Fire-and-forget — listener errors are caught by the
      // wildcard handler so a flaky welcome email doesn't fail registration.
      dispatch('user:registered', {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        to: user?.email,
      })

      return withSessionCookie({
        token: result.token,
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.name,
        },
      }, result.token)
    }

    return response.error('Registration failed')
  },
})
