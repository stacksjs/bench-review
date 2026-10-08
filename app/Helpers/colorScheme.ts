/**
 * Declare the document's colour scheme.
 *
 * ## The bug this fixes
 *
 * bench renders light-only: there is not one `dark:` variant in any template,
 * and every text colour is chosen for a light surface (`text-gray-900`,
 * `text-gray-600`). But nothing in the built page ever painted a background,
 * so the surface was whatever the user agent chose — and a browser in dark
 * mode chooses black. Every one of the ~2990 pages then rendered dark grey
 * text on a black canvas. Verified by emulating `prefers-color-scheme: dark`
 * on the built /judges: the h1 computes to `oklch(0.21 …)` on a canvas with
 * no background anywhere up the ancestor chain, and the page is unreadable;
 * the same page in light mode is correct.
 *
 * Three separate things had to be missing for that to happen, and all three
 * were:
 *
 *   1. `stx.config.ts` sets `app.bodyClass`, but buildApp()'s SSG ignores
 *      `app.*` — the same reason the webfont tags need a post-build splice
 *      (see app/Helpers/fontHead.ts). Every built page ships a bare `<body>`
 *      with no attributes at all.
 *   2. That bodyClass asks for `bg-off-white`, and `off-white` is not defined
 *      in `config/ui.ts`'s theme colours. So even where the class IS written
 *      — `resources/layouts/default.stx` puts it on `<main>` — crosswind
 *      emits no rule for it. `grep -c off-white` on the built CSS is 0.
 *   3. No `color-scheme` meta, so form controls, scrollbars and the canvas
 *      all followed the OS.
 *
 * ## What this declares
 *
 * `color-scheme: light` tells the UA to use light defaults for the canvas and
 * for built-in controls. The explicit background is belt-and-braces: it pins
 * the surface even if a future page or an embedding WebView disagrees about
 * the default.
 *
 * The value is the app's surface colour, `off-white` / #f9f7f1, now that
 * `config/ui.ts` defines it. It is pinned here as well as on the utility so
 * the surface is one colour end to end: the layout's <main> covers the
 * content area, and this covers everything outside it — above the header on
 * an overscroll, below the footer on a short page, and the WebView's own
 * canvas in the iOS app.
 *
 * Used in TWO places (same tags, one source of truth), like FONT_HEAD_TAGS:
 *   - stx.config.ts `app.head.headRaw` — the dev server's document shell
 *   - build.ts post-build splice — static pages
 */

export const COLOR_SCHEME_HEAD_TAGS: string = [
  '<meta name="color-scheme" content="light">',
  '<style>'
  + ':root{color-scheme:light}html,body{background-color:#f9f7f1}'
  // The app's surface colours. These belong in config/ui.ts's theme.colors
  // and are here instead because that key is inert in the static build — see
  // the note on it. `bg-off-white` is written in nine places (the layout's
  // <main>, six views, two components) and emitted nothing until this rule.
  //
  // #f9f7f1 is not invented: Bench/BlurReview.stx fades its gradient to
  // `rgb(249, 247, 241)` in an inline style, and a fade-out gradient has to
  // end on the colour of the surface behind it. The darker step, used by
  // home.stx's top-rated band between two white bands, has no prior record
  // and is a derived tone in the same warm family.
  + '.bg-off-white{background-color:#f9f7f1}'
  + '.bg-off-white-darker{background-color:#f2efe7}'
  + '</style>',
].join('')
