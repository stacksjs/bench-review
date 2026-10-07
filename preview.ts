#!/usr/bin/env bun
/**
 * Serves the static `dist/` build locally for testing before deploying
 * to Netlify / Vercel / S3. Plain file server, no processing.
 *
 * Usage: bun run preview
 */

const port = Number(process.argv[2]) || 3001
const distDir = 'dist'

/**
 * Unbounded dynamic routes → the shell that serves them.
 *
 * Almost every dynamic route in this app is enumerable and pre-rendered at
 * build time (see app/Helpers/staticPaths.ts). One is not: a verification link
 * carries a freshly-minted token, so there is no finite set of pages to
 * generate. Without a rewrite it resolves to no file and every signup
 * confirmation email lands on a 404.
 *
 * `verify-email.html` is the correct shell rather than a generic SPA fallback:
 * the same Bench/VerifyEmail component backs both routes and reads the id and
 * token straight off `window.location.pathname` — precisely because router
 * params are unset on a hard reload, which is what clicking an email link is.
 *
 * Kept as an explicit table, not a catch-all, so genuinely unknown URLs still
 * 404 honestly instead of silently rendering a shell.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ THE HOST MUST PROVIDE TWO THINGS THAT THIS FILE FAKES LOCALLY
 *
 * This is a local preview server. Neither of the following is part of the built
 * artifact, so a host that does not provide them serves a site that looks fine
 * and is broken in two specific ways. (netlify.toml used to carry both; it has
 * been deleted along with Netlify, and config/cloud.ts's `cdn` block is
 * cache-tuning only — there is nowhere in-repo left to declare them.)
 *
 *  1. REWRITE  /verify-email/:id/:token  ->  /verify-email.html   (status 200)
 *
 *     Verification tokens are minted per request, so unlike every other dynamic
 *     route there is no finite set of pages to pre-render. Without the rewrite,
 *     the link in every signup confirmation email 404s. It must be a rewrite,
 *     not a redirect: Bench/VerifyEmail reads the id and token off
 *     location.pathname, so the URL has to survive.
 *
 *  2. PROXY  /api/*  ->  the deployed API origin   (same-origin, status 200)
 *
 *     Every store calls the API with a RELATIVE path (/api/auth, /api/me,
 *     /api/judges, …). In dev the views server proxies it; a static host does
 *     not. Without the proxy every API call resolves against the static origin
 *     and 404s, so the site renders its shells and then stays empty forever.
 *     This server DOES fake it (see API_ORIGIN below) so the built artifact can
 *     be exercised end-to-end locally — but that is a local convenience, not a
 *     substitute for configuring it at the host.
 *
 * On CloudFront (config/cloud.ts sets driver: 'aws') both are cache behaviours:
 * an /api/* behaviour with the API as origin, and a CloudFront Function or a
 * /verify-email/* behaviour rewriting the URI. Whatever the host, these two are
 * the deploy contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const SHELL_REWRITES: Array<[RegExp, string]> = [
  [/^\/verify-email\/[^/]+\/[^/]+\/?$/, '/verify-email.html'],

  // Judge tabs -> the ONE shell page built for that tab, shared by every judge.
  //
  // Note the capture is the TAB, not the id. Pointing these at the judge's own
  // /judges/$1.html was wrong and verified broken in the browser: that view is
  // a separate, older judge page that includes only Bench/Judge/ProfileHeader,
  // so a deep link to /judges/1/reviews rendered the header and an unstyled tab
  // bar with no panel at all — no reviews list, no JudgeTabs scope registered.
  // The /judges/:id/<tab> views are the ones that include JudgeTabs plus their
  // panel, and they resolve the judge from location.pathname, so one shell per
  // tab serves every judge correctly.
  [/^\/judges\/[^/]+\/(profile|reviews|rulings|cases)\/?$/, '/judges/_shell/$1.html'],

  // Courthouse tabs -> the ONE shell page built for that tab, shared by every
  // courthouse. Same shape as the judge rule above, and the capture is again
  // the TAB, not the id: /court-houses/42/bench resolves to the bench shell,
  // which reads the courthouse from useRoute().params with a path fallback.
  //
  // /court-houses/:id itself is NOT rewritten -- it is pre-rendered per
  // courthouse and is what sitemap.ts advertises.
  [/^\/court-houses\/[^/]+\/(profile|bench|reviews)\/?$/, '/court-houses/_shell/$1.html'],

  // Write-a-review forms. Auth-gated, so there is nothing to pre-render per
  // judge; the shell reads the id off location.pathname.
  [/^\/judges\/review\/([^/]+)\/?$/, '/judges/review.html'],
  [/^\/review\/([^/]+)\/?$/, '/review.html'],
]

/**
 * Where /api/* is forwarded, so the BUILT artifact can be exercised locally
 * against a real API.
 *
 * Without this, previewing dist/ was only half an end-to-end: the pre-rendered
 * pages, the per-entity SEO and the hashed CSP were all real, but every store
 * call 404'd against the static origin, so nothing ever loaded data. Meanwhile
 * the dev server has the API but serves from source, so it shows NONE of the
 * build-time output. Neither one alone exercises what actually ships.
 *
 * Defaults to the dev API port. Override with API_ORIGIN to point at a deployed
 * one.
 */
const apiOrigin = (process.env.API_ORIGIN || 'http://localhost:4008').replace(/\/+$/, '')

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // API proxy runs before everything: /api/... has no file behind it, and the
    // extensionless-to-.html mapping below would otherwise turn it into a
    // confusing 404 for a page nobody asked for.
    if (pathname.startsWith('/api/')) {
      const target = `${apiOrigin}${pathname}${url.search}`
      try {
        const upstream = await fetch(target, {
          method: req.method,
          headers: req.headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
          redirect: 'manual',
        })
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        })
      }
      catch {
        // Distinct from a 404: the API simply isn't up. Say so, rather than
        // letting the client see an ambiguous failure and blame the artifact.
        return new Response(
          JSON.stringify({ error: `preview: no API reachable at ${apiOrigin}. Start it, or set API_ORIGIN.` }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        )
      }
    }

    // Shell rewrites run FIRST — before the .html mapping below, which would
    // otherwise turn /verify-email/1/abc into a lookup for a file that by
    // definition cannot exist.
    const rewrite = SHELL_REWRITES.find(([pattern]) => pattern.test(pathname))
    if (rewrite) {
      // `replace`, not assignment: the judge-tab rule carries a capture so it
      // can resolve /judges/123/profile to that judge's own pre-rendered
      // /judges/123.html. Targets without a `$1` are unaffected.
      pathname = pathname.replace(rewrite[0], rewrite[1])
    }
    // Map directory roots and extensionless routes to .html files
    // (Netlify's Pretty URLs mode does the same: /about → /about.html)
    else if (pathname === '/' || pathname === '') {
      pathname = '/index.html'
    }
    else if (!pathname.includes('.')) {
      pathname = pathname.replace(/\/$/, '') + '.html'
    }

    const filePath = `${distDir}${pathname}`
    const file = Bun.file(filePath)

    if (await file.exists()) {
      return new Response(file)
    }

    // Fallback to 404.html
    const notFound = Bun.file(`${distDir}/404.html`)
    if (await notFound.exists()) {
      return new Response(notFound, { status: 404 })
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[preview] serving ./${distDir} at http://localhost:${port}`)
