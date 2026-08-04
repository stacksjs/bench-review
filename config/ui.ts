import type { UiConfig } from '@stacksjs/types'

/**
 * **UI Engine Options**
 *
 * This configuration defines all of your UI Engine options. Because Stacks is fully-typed, you
 * may hover any of the options below and the definitions will be provided. In case you
 * have any questions, feel free to reach out via Discord or GitHub Discussions.
 */
export default {
  shortcuts: [
    [
      'btn',
      'inline-flex items-center px-4 py-2 ml-2 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer',
    ],
  ],

  // Responsive layout utilities are safelisted so page STRUCTURE survives SPA
  // navigation. crosswind emits per-page CSS; on a fragment swap the router
  // merges the incoming page's crosswind, but page-specific responsive variants
  // (lg:/md:/sm: grid-cols / col-span / block) weren't reliably emitted into the
  // fragment — so grids collapsed to a single column after nav and e.g. the
  // reviews "Explore Categories" sidebar (hidden lg:block) vanished. Safelisting
  // forces them into every page's output, so the merge always has them.
  safelist: 'prose prose-sm m-auto text-left '
    + 'grid-cols-1 col-span-1 hidden block '
    + 'lg:block lg:hidden lg:flex lg:grid lg:col-span-2 lg:col-span-4 '
    + 'lg:grid-cols-2 lg:grid-cols-3 lg:grid-cols-4 lg:grid-cols-5 lg:grid-cols-6 '
    + 'md:flex md:grid-cols-2 md:grid-cols-5 '
    + 'sm:block sm:hidden sm:flex sm:col-span-2 sm:col-span-3 sm:col-span-4 sm:col-span-6 '
    + 'sm:grid-cols-2 sm:grid-cols-3 sm:grid-cols-6 sm:grid-cols-12',
  trigger: ':stx:',
  classPrefix: 'stx-',
  reset: 'tailwind',

  icons: ['heroicons'],

  fonts: {
    email: {
      title: 'Mona',
      text: 'Hubot',
    },

    desktop: {
      title: 'Mona',
      text: 'Hubot',
    },

    mobile: {
      title: 'Mona',
      text: 'Hubot',
    },

    web: {
      title: 'Mona',
      text: 'Hubot',
    },
  },

  theme: {
    // ...
    colors: {
      veryCool: '#0000ff', // utility class text-very-cool
      brand: {
        primary: 'hsl(var(--hue, 217) 78% 51%)', // utility class bg-brand-primary
      },
    },
  },

  // stx's client-script DOM guard (validateClientScript, run on every non-server
  // <script> body at render). WARN-ONLY: failOnViolation stays false so it never
  // throws in dev or prod — it only surfaces raw-DOM usage on the dev-server
  // terminal. Flip to true once the app is e2e-verified clean of anything not
  // allowlisted below.
  //
  // allowPatterns is a rule-global substring match against each rule's message,
  // so each entry grandfathers one prohibited pattern project-wide. The entries
  // below are bench's DELIBERATE, documented deviations; the guard still catches
  // every other prohibited pattern (document.cookie, innerHTML=, bare
  // localStorage / location.assign, window.open, document.write, setInterval, …)
  // — the categories bench does not use.
  strict: {
    enabled: true,
    failOnViolation: false,
    allowPatterns: [
      // window-prefixed globals are deliberate: bare `location` / `history` get
      // shadowed by store signals in stx scopes (documented footgun), so bench
      // always qualifies them with `window.`.
      'window.location',
      'window.history',
      'window.scrollTo',
      'window.addEventListener',
      'window.prompt',
      // Hydration / ref node reads — bench reads its mount nodes by id.
      'getElementById',
      // Fire-once UI timers, all tracked and cancellable (audited: no leaks).
      // setInterval is intentionally NOT allowlisted — poll loops must warn.
      'setTimeout',
      'clearTimeout',
      // RichTextEditor wraps ts-medium-editor; DOM building is inherent to the
      // third-party editor and cannot be expressed as directives.
      'createElement',
      'querySelector',
      'document.addEventListener',
    ],
  },
} satisfies UiConfig
