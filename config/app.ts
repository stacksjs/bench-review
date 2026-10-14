import type { AppConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * **Application Configuration**
 *
 * This configuration defines all of your application options. Because Stacks is fully-typed,
 * you may hover any of the options below and the definitions will be provided. In case
 * you have any questions, feel free to reach out via Discord or GitHub Discussions.
 */
export default {
  name: env.APP_NAME ?? 'Stacks',
  description: 'Stacks is a full-stack framework for building modern web applications.',
  env: env.APP_ENV ?? 'local',
  // Scheme STRIPPED, deliberately (bench-review#55).
  //
  // Two contracts collided here. The framework treats `app.url` as a bare
  // host — its own default is `stacks.localhost` — and builds absolute links
  // by prepending the scheme itself, e.g. password-reset emails do
  // `https://${config.app.url}`. bench's own helpers read `process.env.APP_URL`
  // directly and expect a FULL url, because they interpolate it as
  // `${APP_URL}/article/123`.
  //
  // `.env` carries the full url, which satisfies bench's helpers and made the
  // framework emit `https://http://localhost:4000/password/reset/...` — an
  // unusable link in the one email a locked-out user depends on.
  //
  // Normalising here gives each side what it is asking for: the framework gets
  // the bare host it expects, and `process.env.APP_URL` is untouched for
  // everything in app/ that reads it.
  url: (env.APP_URL ?? 'stacks.localhost').replace(/^https?:\/\//, ''),
  redirectUrls: ['stacksjs.com'],
  debug: env.DEBUG ?? false,
  key: env.APP_KEY,

  maintenanceMode: env.APP_MAINTENANCE ?? false,
  // docMode: true, // instead of example.com/docs, deploys example.com as main entry point for docs
  docMode: false,

  timezone: 'America/Los_Angeles',
  locale: 'en',
  fallbackLocale: 'en',
  cipher: 'aes-256-cbc',
} satisfies AppConfig
