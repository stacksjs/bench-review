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
 *     Note this preview server does NOT fake it, so `bun run preview` shows
 *     chrome without data — that is expected here, not a bug.
 *
 * On CloudFront (config/cloud.ts sets driver: 'aws') both are cache behaviours:
 * an /api/* behaviour with the API as origin, and a CloudFront Function or a
 * /verify-email/* behaviour rewriting the URI. Whatever the host, these two are
 * the deploy contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const SHELL_REWRITES: Array<[RegExp, string]> = [
  [/^\/verify-email\/[^/]+\/[^/]+\/?$/, '/verify-email.html'],
]

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // Shell rewrites run FIRST — before the .html mapping below, which would
    // otherwise turn /verify-email/1/abc into a lookup for a file that by
    // definition cannot exist.
    const rewrite = SHELL_REWRITES.find(([pattern]) => pattern.test(pathname))
    if (rewrite) {
      pathname = rewrite[1]
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
