/**
 * Self-hosted webfont head tags (design pass, 2026-07).
 *
 * Geist (variable, latin, weights 100-900) served from /fonts so the
 * planned CSP lockdown can keep `font-src 'self'` (app/Helpers/cspMeta.ts)
 * and no third-party host sits on the render path. `font-display: swap`
 * keeps text visible during load; the preload keeps the swap window short.
 *
 * The `body.font-sans` selector intentionally out-specifies crosswind's
 * `.font-sans` utility (stx.config.ts bodyClass) so the whole app inherits
 * Geist; explicit `font-serif` / `font-mono` utilities are untouched.
 *
 * Used in TWO places (same tags, one source of truth):
 *   - stx.config.ts `app.head.headRaw` — the dev server's document shell
 *   - build.ts post-build splice — buildApp()'s SSG ignores app.head, so
 *     static pages get the tags spliced in like SEO/analytics/CSP
 */

export const FONT_HEAD_TAGS = [
  '<link rel="preload" href="/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>',
  '<style>'
  + '@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;'
  + 'src:url(/fonts/geist-latin-wght-normal.woff2) format("woff2")}'
  + 'body,body.font-sans{font-family:Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}'
  + '</style>',
].join('')
