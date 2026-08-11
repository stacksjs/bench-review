#!/usr/bin/env bun
/**
 * Conformance gate — the mechanical half of "is bench still healthy".
 *
 * Runs against the CONTENTS OF dist/, not the source, because the failures
 * worth catching here are ones the source looks fine for. The static build
 * spent three weeks emitting 6KB shells full of stx error banners while
 * `bun build.ts` reported "37 pages, 0 failed": the SSG catches include
 * failures per-include and splices the error into the page rather than
 * failing. Nothing in lint, tsc, or the build's own exit code could see it.
 * Check 1 below is exactly that check.
 *
 * Run `bun run gate` (builds first, then verifies). Exits non-zero on any
 * failure, so it works as a pre-push or CI step.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NOINDEX_PAGES, SEO_PAGES } from './app/Helpers/seoPages'

interface Check { name: string, ok: boolean, detail: string }
const checks: Check[] = []
const add = (name: string, ok: boolean, detail = ''): void => void checks.push({ name, ok, detail })

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory())
      walk(p, out)
    else if (p.endsWith('.html')) out.push(p)
  }
  return out
}

const pages = walk('dist')
const html = new Map<string, string>()
for (const p of pages) html.set(p, await Bun.file(p).text())

// 1. Includes resolved. The one that has actually bitten.
{
  const broken: string[] = []
  for (const [p, h] of html) {
    const n = (h.match(/Error loading include file/g) || []).length
    if (n) broken.push(`${p.replace('dist/', '')} (${n})`)
  }
  add('every @include resolved', broken.length === 0, broken.slice(0, 5).join(', '))
}

// 2. No <img> shipped without a usable src. Tags inside <template> are inert
//    (never rendered, no request, not in the a11y tree) so they don't count.
{
  const bad: string[] = []
  for (const [p, h] of html) {
    let depth = 0
    for (const m of h.matchAll(/<(\/?)(template|img)\b([^>]*)>/g)) {
      const [, close, tag, attrs] = m
      if (tag === 'template') { depth += close ? -1 : 1; continue }
      if (depth === 0 && !/\ssrc\s*=\s*"[^"]+"/.test(attrs))
        bad.push(p.replace('dist/', ''))
    }
  }
  add('no <img> without a src', bad.length === 0, [...new Set(bad)].slice(0, 5).join(', '))
}

// 3-4. Indexable pages carry canonical + parseable JSON-LD.
{
  const noCanonical: string[] = []
  const badLd: string[] = []
  for (const file of Object.keys(SEO_PAGES)) {
    const h = html.get(`dist/${file}`)
    if (!h) continue
    if (!h.includes('rel="canonical"')) noCanonical.push(file)
    const m = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    if (!m) { badLd.push(`${file} (missing)`); continue }
    try { JSON.parse(m[1]) }
    catch { badLd.push(`${file} (unparseable)`) }
  }
  add('indexable pages have canonical', noCanonical.length === 0, noCanonical.join(', '))
  add('indexable pages have valid JSON-LD', badLd.length === 0, badLd.join(', '))
}

// 5. Pages we never want indexed say so.
{
  const missing = NOINDEX_PAGES.filter((f) => {
    const h = html.get(`dist/${f}`)
    return h !== undefined && !/<meta\s+name="robots"[^>]*noindex/i.test(h)
  })
  add('noindex pages are marked noindex', missing.length === 0, missing.join(', '))
}

// 6. SEO_PAGES and the sitemap agree. These have drifted apart twice: a page
//    gets a description and canonical but never makes it into the sitemap.
{
  const sitemap = await Bun.file('dist/sitemap.xml').text()
  const missing = Object.values(SEO_PAGES)
    .map(s => s.path)
    .filter(path => !new RegExp(`<loc>[^<]*${path.replace(/\//g, '\\/')}(</loc>|/</loc>)`).test(sitemap))
  add('every indexable page is in the sitemap', missing.length === 0, missing.join(', '))
}

// 6b. Every advertised URL actually resolves to a file. The sitemap listed 29
//     dynamic URLs — every judge, courthouse and published review — for which
//     the build emitted nothing, so preview.ts (and any host doing the same
//     pretty-URL mapping) served 404.html with a 404 status for the entire
//     content corpus while telling crawlers those URLs were canonical.
{
  const sitemap = await Bun.file('dist/sitemap.xml').text()
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
  const missing: string[] = []
  for (const p of locs) {
    const f = p === '/' ? 'dist/index.html' : `dist${p.replace(/\/$/, '')}.html`
    if (!(await Bun.file(f).exists())) missing.push(p)
  }
  add('every sitemap URL has a built file', missing.length === 0, missing.length ? `${missing.length} missing: ${missing.slice(0, 4).join(', ')}` : '')
}

// 6c. Every pre-rendered entity page carries its own head. These are generated
//     from the database, so a schema change or a failed query degrades them
//     silently back to the SSG's generic per-route title.
{
  const { loadEntitySeo } = await import('./app/Helpers/entitySeo')
  const entities = await loadEntitySeo('https://bench.review')
  const bad: string[] = []
  for (const [file, seo] of entities) {
    const h = html.get(`dist/${file}`)
    if (!h) continue
    const hasDesc = /<meta\s+name="description"[^>]*content="[^"]+"/i.test(h)
    const hasLd = h.includes('application/ld+json')
    // The generic title is what the SSG emits for every entity on a route;
    // seeing it back means the entity injection didn't take. Compare decoded
    // text, not raw markup — a title containing `&` is legitimately escaped to
    // `&amp;` in the output, and a naive substring match reads that as a miss.
    const decode = (s: string): string => s
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const pageTitle = decode((h.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim())
    const ownTitle = pageTitle === seo.title
    if (!hasDesc || !hasLd || !ownTitle)
      bad.push(`${file}${!ownTitle ? ' (generic title)' : ''}${!hasDesc ? ' (no description)' : ''}${!hasLd ? ' (no json-ld)' : ''}`)
  }
  add(`all ${entities.size} entity pages have their own head`, bad.length === 0, bad.slice(0, 4).join(', '))
}

// 6d. Every dynamic route is either pre-rendered or explicitly rewritten.
//     Miss one and it 404s in production for everybody, silently — which is
//     how the verification link in every signup email, the "Write Review" CTA
//     and every bare /judges/:id URL came to be dead.
{
  const unhandled: string[] = []

  // Parse the ACTUAL rewrite patterns out of preview.ts and test routes against
  // them. An earlier version of this check just asked whether preview.ts
  // mentioned the route's path segment anywhere — which the file's own
  // explanatory comments satisfied, so deleting SHELL_REWRITES entirely would
  // have left this check green. A check that passes when the thing it tests is
  // absent is worse than no check.
  // Evaluate the array literal rather than regex-parsing it: the patterns
  // themselves contain slashes inside character classes ([^/]+), which defeats
  // any reasonable "find a regex literal" regex.
  const preview = await Bun.file('preview.ts').text()
  // Anchor on the assignment, not the first '[' — that one belongs to the type
  // annotation Array<[RegExp, string]>.
  const decl = preview.indexOf('SHELL_REWRITES')
  const open = preview.indexOf('[', preview.indexOf('=', decl))
  const close = preview.indexOf('\n]', open)
  let rewrites: RegExp[] = []
  try {
    const pairs = new Function(`return ${preview.slice(open, close + 2)}`)() as Array<[RegExp, string]>
    rewrites = pairs.map(pair => pair[0])
  }
  catch {
    rewrites = []
  }

  for await (const p of new Bun.Glob('resources/views/**/[[]*[]]*.stx').scan('.')) {
    // `[...all]` is the catch-all, which exists precisely to handle URLs that
    // have no page. Enumerating it is meaningless.
    if (/\[\.\.\./.test(p))
      continue
    const src = await Bun.file(p).text()
    if (src.includes('getStaticPaths'))
      continue
    // Build a concrete URL for this route and see whether a rewrite claims it.
    const sample = `/${p.replace('resources/views/', '').replace(/(\/index)?\.stx$/, '').replace(/\[[^\]]+\]/g, 'x')}`
    if (rewrites.some(re => re.test(sample)))
      continue
    unhandled.push(`${p.replace('resources/views/', '')} (no page, no rewrite for ${sample})`)
  }
  add('every dynamic route is pre-rendered or rewritten', unhandled.length === 0, unhandled.join(', '))
}

// 6e. The artifact's absolute URLs match the host it was built for.
//
//     normalizeBase falls back to http://localhost:4000 when APP_URL is unset,
//     silently, and every canonical, og:url, JSON-LD @id, <loc> and the
//     robots.txt Sitemap line inherits it — as does the analytics script src
//     via its own DEFAULT_API_ENDPOINT. A deploy runner with an empty .env
//     therefore produces a complete, successful-looking build that tells every
//     crawler the canonical home of every page is a loopback address.
//
//     When APP_URL is set (CI, deploy) this is a hard failure. When it isn't
//     (a local build) loopback URLs are correct, so the check passes but says
//     plainly that the artifact is not deployable — rather than going red on
//     every local run and training everyone to ignore it.
{
  const appUrl = process.env.APP_URL?.trim()
  const loopback = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/g
  const offenders: string[] = []
  let hits = 0
  for (const [p, h] of html) {
    const found = h.match(loopback)
    if (found) { hits += found.length; offenders.push(p.replace('dist/', '')) }
  }
  for (const extra of ['dist/sitemap.xml', 'dist/robots.txt']) {
    const f = Bun.file(extra)
    if (await f.exists()) {
      const found = (await f.text()).match(loopback)
      if (found) { hits += found.length; offenders.push(extra.replace('dist/', '')) }
    }
  }

  if (appUrl && !/localhost|127\.0\.0\.1/.test(appUrl)) {
    add(
      'no loopback URLs in a deploy build',
      hits === 0,
      hits ? `APP_URL=${appUrl} but ${hits} loopback URLs shipped, in ${new Set(offenders).size} files (${[...new Set(offenders)].slice(0, 3).join(', ')})` : '',
    )
  }
  else {
    add(
      'build host is declared (APP_URL)',
      true,
      `APP_URL unset — artifact carries ${hits} loopback URLs and is NOT deployable. Local preview only; set APP_URL to build for deploy.`,
    )
  }
}

// 7. The sitemap never advertises a path robots.txt forbids.
{
  const sitemap = await Bun.file('dist/sitemap.xml').text()
  const robots = await Bun.file('dist/robots.txt').text()
  const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map(m => m[1])
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
  // Disallow is a PREFIX match unless anchored with `$` (RFC 9309), which is
  // the distinction that makes `/review` vs `/reviews` a real trap.
  const blocks = (rule: string, path: string): boolean =>
    rule.endsWith('$') ? path === rule.slice(0, -1) : path.startsWith(rule)
  const conflicts = locs.filter(p => disallowed.some(d => d !== '/' && blocks(d, p)))
  add('sitemap and robots.txt do not contradict', conflicts.length === 0, conflicts.join(', '))
}

// 8. Rule 2 — no poll loops, no scope-shadowable bare globals.
{
  const offenders: string[] = []
  for await (const p of new Bun.Glob('resources/**/*.{stx,ts}').scan('.')) {
    const s = await Bun.file(p).text()
    for (const [i, line] of s.split('\n').entries()) {
      const code = line.replace(/\/\/.*$/, '')
      if (/\bsetInterval\s*\(/.test(code)) offenders.push(`${p}:${i + 1} setInterval`)
      if (/(^|[^.\w])(history|location)\.(back|forward|go|replaceState|pushState|assign|reload|href)\b/.test(code))
        offenders.push(`${p}:${i + 1} bare history/location`)
    }
  }
  add('no setInterval / bare history-location', offenders.length === 0, offenders.slice(0, 5).join('; '))
}

// 9. Rule 10 — declared functions and arrow consts carry return types.
{
  let missing = 0
  for await (const p of new Bun.Glob('app/**/*.ts').scan('.')) {
    const s = await Bun.file(p).text()
    for (const m of s.matchAll(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(:)?/gm))
      if (!m[1]) missing++
    for (const m of s.matchAll(/^\s*(?:export\s+)?const\s+\w+\s*(?::\s*[^=]+)?=\s*(?:async\s+)?\([^)]*\)\s*(:[^=]*)?=>/gm))
      if (!m[1]) missing++
  }
  add('app functions declare return types', missing === 0, missing ? `${missing} missing` : '')
}

const failed = checks.filter(c => !c.ok)
console.log(`\n  bench conformance gate — ${pages.length} built pages\n`)
for (const c of checks)
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `\n      ${c.detail}` : ''}`)
console.log(failed.length ? `\n  ${failed.length} of ${checks.length} checks FAILED\n` : `\n  all ${checks.length} checks passed\n`)
process.exit(failed.length ? 1 : 0)
