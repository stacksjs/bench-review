import { reportError } from './reportError'

/**
 * Send mail without making the caller wait for SMTP (bench-review#55).
 *
 * Every transactional email in the app was `await mail.send(...)` inside the
 * request that triggered it, under `QUEUE_DRIVER=sync` where `mail.queue()` is
 * inert. So the person submitting a review waited for a third-party SMTP
 * handshake — up to the driver's 30s timeout — before their own request came
 * back, for a side effect they did not ask for and cannot see.
 *
 * Worse on the password-reset path: that endpoint deliberately returns an
 * identical response whether or not the address exists, and awaiting the send
 * made the RESPONSE TIME depend on whether a send happened. The uniform body
 * said nothing while the clock said everything.
 *
 * This detaches the send and routes failures to `reportError`, so the request
 * returns immediately and a delivery failure is still discoverable.
 *
 * ── What must NOT use this ──────────────────────────────────────────────────
 * Mail the user is actively waiting on, where not-delivered has to fail the
 * request: the admin second-factor code (bench-review#56) is awaited on
 * purpose and fails CLOSED, because a code nobody received is not a factor
 * that was satisfied. If the user cannot proceed without the email, await it.
 *
 * A real queue (`QUEUE_DRIVER=database` plus a worker) is the better answer
 * and this is the seam it slots into: the body of this function becomes a
 * `mail.queue()` call and nothing else changes.
 */
export function sendMailDetached(context: string, message: Record<string, unknown>): void {
  // Deliberately not awaited, and not returned — a caller that awaits this by
  // accident would reintroduce exactly the blocking this exists to remove.
  void (async () => {
    try {
      const { mail } = await import('@stacksjs/email')
      await (mail as any).send(message)
    }
    catch (err) {
      reportError(context, err, {
        to: typeof message.to === 'string' ? message.to : undefined,
        subject: typeof message.subject === 'string' ? message.subject : undefined,
      })
    }
  })()
}
