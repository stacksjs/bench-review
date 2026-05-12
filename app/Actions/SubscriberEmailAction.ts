import { Action } from '@stacksjs/actions'
import { HttpError } from '@stacksjs/error-handling'
import { Subscriber } from '@stacksjs/orm'
import { sendSubscriptionConfirmation } from '../Mail/SubscriptionConfirmation'

/**
 * Bench-review override of the framework's SubscriberEmailAction.
 *
 * Writes a single row — `subscribers` — and nothing else. The framework
 * default also inserts into `subscriber_emails` on every signup, but
 * that's a per-event log meant for individual outbound messages
 * (confirmation mail, weekly digest, transactional notifications). It
 * shouldn't get a row at signup time; that should happen when the
 * mailer actually sends something. Keeping the two tables cleanly
 * separated lets us answer "how many subscribers do we have?" from
 * `subscribers` alone, without de-duping a per-message log.
 *
 * Step-by-step `console.log` so the buddy `dev:api` terminal makes the
 * full request flow visible — entry, validation, dedupe, write,
 * response. Plain `console.log` (not `@stacksjs/logging`) so the
 * output appears regardless of log-level config.
 */
const TAG = '[SubscriberEmailAction]'

export default new Action({
  name: 'SubscriberEmailAction',
  description: 'Bench-review subscribe handler — saves email to subscribers only',
  method: 'POST',

  async handle(request: any) {
    const startedAt = Date.now()
    console.log(`${TAG} ── request received`)

    let body: Record<string, unknown> = {}
    try {
      body = typeof request?.all === 'function' ? request.all() : {}
    }
    catch (err) {
      console.log(`${TAG} request.all() threw:`, err instanceof Error ? err.message : err)
    }
    console.log(`${TAG} body:`, body)

    const email = (request?.get?.('email') ?? body.email) as unknown
    const source = ((request?.get?.('source') ?? body.source) as string | undefined) || 'homepage'
    console.log(`${TAG} parsed: email=${JSON.stringify(email)} source=${JSON.stringify(source)}`)

    if (typeof email !== 'string' || !email.includes('@')) {
      console.log(`${TAG} ✗ validation failed — throwing 422`)
      throw new HttpError(422, 'A valid email is required')
    }

    const normalized = email.trim().toLowerCase()
    console.log(`${TAG} normalized email: ${normalized}`)

    // Dedupe — reject repeat signups with 422 instead of hitting the
    // unique-index violation (which would surface as a generic 500).
    let existing: any = null
    try {
      existing = await Subscriber.where('email', normalized).first()
    }
    catch (err) {
      console.log(`${TAG} ✗ Subscriber.where(...).first() threw:`, err instanceof Error ? err.message : err)
      throw err
    }
    console.log(`${TAG} existing subscriber:`, existing ? `id=${existing.id}` : 'none')

    if (existing) {
      console.log(`${TAG} ✗ already subscribed — throwing 422`)
      throw new HttpError(422, 'Already subscribed')
    }

    let subscriber: any
    try {
      subscriber = await Subscriber.create({ email: normalized, status: 'subscribed', source })
      console.log(`${TAG} ✓ Subscriber.create OK — id=${subscriber?.id} uuid=${subscriber?.uuid}`)
    }
    catch (err) {
      console.log(`${TAG} ✗ Subscriber.create threw:`, err instanceof Error ? err.message : err)
      throw err
    }

    // Fire the confirmation email asynchronously so the request returns
    // to the form promptly even if the SMTP server is slow. Any send
    // failure is logged but doesn't roll back the subscriber row — the
    // person is still subscribed; the mailer just needs to retry.
    // SMTP target is whatever .env's MAIL_HOST / MAIL_PORT point at
    // (Helo on 127.0.0.1:2525 in dev).
    sendSubscriptionConfirmation({
      to: normalized,
      subscriberUuid: subscriber?.uuid,
    })
      .then(() => console.log(`${TAG} ✓ confirmation email queued for ${normalized}`))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`${TAG} ✗ confirmation email failed for ${normalized}: ${message}`)
      })

    const ms = Date.now() - startedAt
    console.log(`${TAG} ── done in ${ms}ms — returning {success:true, subscriber:{id:${subscriber?.id}}}`)
    return { success: true, subscriber }
  },
})
