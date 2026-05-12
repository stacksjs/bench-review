import type { EmailConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * **Email Configuration**
 *
 * This configuration defines all of your email options. Because Stacks is fully-typed, you
 * may hover any of the options below and the definitions will be provided. In case you
 * have any questions, feel free to reach out via Discord or GitHub Discussions.
 */
export default {
  from: {
    name: env.MAIL_FROM_NAME || 'Stacks',
    address: env.MAIL_FROM_ADDRESS || 'no-reply@stacksjs.org',
  },

  mailboxes: ['chris@stacksjs.org', 'blake@stacksjs.org', 'glenn@stacksjs.org'],

  url: env.APP_URL || 'http://localhost:3000',
  charset: 'UTF-8',

  server: {
    scan: true, // scans for spam and viruses
  },

  // `MAIL_MAILER` is the env var the .env template actually sets. The
  // earlier `MAIL_DRIVER` lookup never matched and silently fell back
  // to `ses`, which refuses to talk to a local SMTP catcher like
  // Helo / Mailpit. Default `smtp` when nothing's set so a freshly
  // cloned project still hits a sensible local target out of the box.
  default: env.MAIL_MAILER || env.MAIL_DRIVER || 'smtp',
} satisfies EmailConfig
