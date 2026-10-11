import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * POST /api/email/unsubscribe — drop a newsletter subscriber, by the token
 * carried in their mail.
 *
 * This did not exist. `app/Mail/SubscriptionConfirmation.ts` built its
 * unsubscribe link with `url('email.unsubscribe', …)`, a route name nothing
 * ever registered, so the call threw before `mail.send` was reached and the
 * confirmation mail was never sent at all — the failure surfaced only as a
 * logged line in the subscribe action's catch. Nobody who signed up ever
 * received anything, and there was no way out of a list bench could not yet
 * send to. Both halves had to be fixed before any scheduled send could be
 * contemplated: a recurring email with no working opt-out is not a thing to
 * ship (bench-review#57).
 *
 * POST, not GET, deliberately. A one-click GET link is prefetched by mail
 * scanners and link-rewriting proxies, which would unsubscribe people who
 * never clicked anything. The emailed link opens /unsubscribe?token=…, a
 * page with a button that posts here.
 *
 * Unauthenticated by necessity — the whole point is that somebody who is not
 * signed in can get off the list — so the token IS the authorisation. It is
 * the subscriber's uuid: unguessable, and already unique-indexed.
 *
 * Always answers `ok` for a well-formed token, whether or not it matched a
 * row. Reporting "no such subscriber" would turn this into an oracle for
 * testing whether a given uuid is on the list, and it would tell the person
 * reading their own unsubscribe confirmation nothing they can act on. A
 * malformed token is a different case — that one is worth reporting, because
 * it means the link itself was mangled in transit.
 */
const TOKEN_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export default new Action({
  name: 'Email Unsubscribe',
  description: 'Unsubscribe a newsletter subscriber using their emailed token',
  method: 'POST',
  async handle() {
    const token = String(request.query?.token ?? request.get?.('token') ?? '').trim()

    if (!TOKEN_RE.test(token))
      return response.json({ error: 'This unsubscribe link is missing or malformed. Please use the link from the email.' }, 422)

    const now = new Date().toISOString()

    // Unconditional, so a second click is a no-op rather than an error, and
    // so a subscriber already marked 'unsubscribed' still gets their
    // timestamp refreshed rather than a 404.
    await (db.updateTable('subscribers') as any)
      .set({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now })
      .where('uuid', '=', token)
      .execute()

    return response.json({ ok: true })
  },
})
