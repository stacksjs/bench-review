/**
 * stx configuration.
 *
 * Most defaults are fine — the explicit pieces here:
 * - `plugins`: registers the `@stacksjs/components` adapter (see
 *   `plugins/stx-components.ts`) so `<Notification>` and friends resolve
 *   from the installed package. No vendored copies under
 *   `resources/components/`.
 * - Directory names match Stacks' conventions for an `app/` + `resources/`
 *   layout, declared explicitly so a fresh checkout doesn't depend on
 *   stx's auto-detection of which root to use.
 * - `app.head.script`: registers ts-analytics, keyed by App ID (Fathom-style).
 */
import { tsAnalytics } from '@stacksjs/ts-analytics/stx'
import { TS_ANALYTICS_APP_ID } from './config/ts-analytics'

export default {
  componentsDir: 'components',
  layoutsDir: 'layouts',
  partialsDir: 'components',
  pagesDir: 'views',

  plugins: [
    './plugins/stx-components',
  ],

  app: {
    head: {
      // Fallback title/description for pages that don't set their own via
      // @section('title') / @head (hoisted into the static <head>, stx#1756).
      title: 'Bench Review: Read and Write Reviews of Judges',
      meta: [
        { name: 'description', content: 'Bench Review is a public directory of judges where attorneys, clerks, and court staff share first-hand reviews. Search judges by name and court.' },
      ],
      // ts-analytics, added like a Nuxt module — just an App ID (Fathom-style),
      // set once in config/ts-analytics.ts. The endpoint is baked into the
      // integration; override per-env via the TS_ANALYTICS_ENDPOINT env var.
      script: [
        ...tsAnalytics({ appId: TS_ANALYTICS_APP_ID }),
      ],
      bodyClass: 'min-h-screen bg-off-white font-sans antialiased',
    },
    router: {
      container: 'main',
    },
  },
}
