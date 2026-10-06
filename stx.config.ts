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
import { FONT_HEAD_TAGS } from './app/Helpers/fontHead'
import { TS_ANALYTICS_APP_ID } from './config/ts-analytics'
import site from './site.config'

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
      // Both come from site.config.ts so the shell, the JSON-LD graph, and
      // the sitemap can't disagree about what this site is called.
      title: site.seo.title,
      meta: [
        { name: 'description', content: site.seo.description },
      ],
      // ts-analytics, added like a Nuxt module — just an App ID (Fathom-style),
      // set once in config/ts-analytics.ts. The endpoint is baked into the
      // integration; override per-env via the TS_ANALYTICS_ENDPOINT env var.
      script: [
        ...tsAnalytics({ appId: TS_ANALYTICS_APP_ID }),
      ],
      // Self-hosted Geist webfont (preload + @font-face + body override).
      // Static pages get the same tags spliced in by build.ts — the SSG
      // ignores app.head, this covers the dev server shell.
      headRaw: FONT_HEAD_TAGS,
      bodyClass: 'min-h-screen bg-off-white font-sans antialiased',
    },
    router: {
      container: 'main',
    },
  },
}
