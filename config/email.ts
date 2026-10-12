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
  // Fallbacks are bench's own domain, not the scaffolding's. These used to
  // read 'Stacks' and 'no-reply@stacksjs.org', so a deploy that forgot
  // MAIL_FROM_ADDRESS would have sent every verification and password-reset
  // mail claiming to be from a domain this app does not own — which fails
  // SPF/DKIM for that domain, lands in spam or bounces, and puts another
  // organisation's name on bench's mail. A wrong fallback is worse than a
  // missing one here, because nothing errors; it just quietly sends.
  from: {
    name: env.MAIL_FROM_NAME || 'Bench Review',
    address: env.MAIL_FROM_ADDRESS || 'no-reply@benchreview.org',
  },

  // Stock Stacks listed three stacksjs.org addresses here. Nothing in this
  // app reads `mailboxes`, so it is emptied rather than guessed at; fill it
  // in if inbound parsing is ever wired up.
  mailboxes: [],

  // 4000, matching APP_URL's default everywhere else in this app (the
  // mailers, build.ts, the gate). It read 3000, so a dev-mode email could
  // link at a port nothing serves.
  url: env.APP_URL || 'http://localhost:4000',
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
