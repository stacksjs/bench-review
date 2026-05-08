export default {
  // Paths relative to root ('resources', auto-detected).
  // Don't include the 'resources/' prefix — it's already the root.
  componentsDir: 'components',
  layoutsDir: 'layouts',
  partialsDir: 'components',
  pagesDir: 'views',

  // No crosswind config file in this project — bunfig will fall back to
  // crosswind defaults. Add a `config/crosswind.ts` and point this back
  // at './crosswind.ts' if the project needs custom Tailwind utilities.

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
