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
      // Fallback title/description for pages that don't set their own via
      // @section('title') / useHead (hoisted into the static <head>, stx#1756).
      title: 'Bench Review — Read & Write Reviews of Judges',
      meta: [
        { name: 'description', content: 'Bench Review is a public directory of judges where attorneys, clerks, and court staff share first-hand reviews. Search judges by name and court.' },
      ],
      bodyClass: 'min-h-screen bg-off-white font-sans antialiased',
    },
    router: {
      container: 'main',
    },
  },
}
