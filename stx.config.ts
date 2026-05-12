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
 */
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
      title: 'Bench Review — The Chamber of Secrets',
      meta: [
        { name: 'description', content: 'Judge review and court directory platform' },
      ],
      bodyClass: 'min-h-screen bg-off-white font-sans antialiased',
    },
    router: {
      container: 'main',
    },
  },
}
