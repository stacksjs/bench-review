import { config } from '@stacksjs/config'
import { mail, template } from '@stacksjs/email'

export interface SubscriptionConfirmationOptions {
  to: string
  subscriberUuid: string
}

/**
 * Send a subscription confirmation email with an unsubscribe link.
 *
 * Uses the `resources/emails/subscription-confirmation.stx` template.
 */
export async function sendSubscriptionConfirmation(options: SubscriptionConfirmationOptions): Promise<void> {
  const { to, subscriberUuid } = options

  const appName = config.app.name || 'Stacks'
  // Built from APP_URL rather than url('email.unsubscribe', …): that named
  // route did not exist, so this line THREW on every call and the
  // confirmation mail was never sent — the failure showed up only as a
  // logged line in the subscribe action's catch. The same APP_URL string
  // concatenation the other mailers use (see SubmitReviewAction).
  const base = process.env.APP_URL || 'http://localhost:4000'
  const unsubscribeUrl = `${base}/unsubscribe?token=${encodeURIComponent(subscriberUuid)}`

  const { html, text } = await template('subscription-confirmation', {
    variables: {
      email: to,
      unsubscribeUrl,
    },
    subject: `Welcome to ${appName}!`,
  })

  await mail.send({
    to: [to],
    from: {
      name: config.email.from?.name || appName,
      address: config.email.from?.address || 'hello@stacksjs.com',
    },
    subject: `Welcome to ${appName}!`,
    html,
    text,
  })
}

export default sendSubscriptionConfirmation
