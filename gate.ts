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
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NOINDEX_PAGES, SEO_PAGES } from './app/Helpers/seoPages'

// ── Database pre-flight ─────────────────────────────────────────────────
// Three checks below read the database, and it is not always there. The
// first CI run of this gate proved it: a runner has no `.env`, so
// DB_CONNECTION is unset and config/database.ts defaults to **mysql**. The
// driver's failure then surfaced from its own connection teardown — an
// unhandled rejection that killed the process instead of failing a check,
// which a try/catch around the query cannot help with.
//
// Decided once, before anything opens a connection.
const dbDriver = (process.env.DB_CONNECTION ?? '').trim().toLowerCase()
const dbPath = (process.env.DB_DATABASE ?? 'database/stacks.sqlite').trim()
const dbReachable = dbDriver === 'sqlite' && existsSync(dbPath)
// Is this artifact a release candidate? The same test check 10 applies, and
// it is NOT merely "APP_URL is set": the local .env sets it to
// http://localhost:4000, so a bare truthiness test calls every local run a
// release and fails checks that could not run for ordinary reasons. A deploy
// build is one pointed at a host that is not this machine.
const appHost = process.env.APP_URL?.trim()
const isReleaseBuild = !!appHost && !/localhost|127\.0\.0\.1/.test(appHost)
const dbSkipReason = dbDriver === 'sqlite'
  ? `no database at ${dbPath}`
  : `DB_CONNECTION is ${dbDriver || 'unset (defaults to mysql)'}, not sqlite`

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
  // Database-backed, so it honours the pre-flight at the top of this file.
  // This is the check that actually crashed CI: it runs long before the
  // getStaticPaths ones and pulls the db client in through entitySeo.
  const entities = dbReachable
    ? await (await import('./app/Helpers/entitySeo')).loadEntitySeo('https://bench.review')
    : new Map<string, { title: string }>()
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
  add(
    dbReachable ? `all ${entities.size} entity pages have their own head` : 'entity pages have their own head',
    dbReachable ? bad.length === 0 : !isReleaseBuild,
    dbReachable
      ? bad.slice(0, 4).join(', ')
      : `not checked — ${dbSkipReason}${isReleaseBuild ? '' : '. APP_URL is unset, so this is reported rather than failed'}`,
  )
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

// 6f. Every inline script is covered by a hash in its own page's CSP.
//
//     script-src now carries a sha256 per inline script instead of
//     'unsafe-inline'. That is only safe if the hashes actually match: a build
//     pass that adds or edits an inline script AFTER the CSP step, or any
//     serve-time HTML rewriting, silently breaks the page's JS in the browser
//     while every other check here stays green. This recomputes the digests
//     from the shipped bytes and compares them to the shipped policy.
{
  const uncovered: string[] = []
  let inline = 0
  let unsafeInline = 0
  let handlers = 0
  for (const [p, h] of html) {
    const meta = h.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)
    if (!meta)
      continue
    if (meta[1].includes('unsafe-inline'))
      unsafeInline++
    handlers += [...h.matchAll(/\son[a-z]+\s*=/g)].length
    for (const m of h.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      inline++
      const digest = new Bun.CryptoHasher('sha256').update(m[1], 'utf8').digest('base64')
      if (!meta[1].includes(`'sha256-${digest}'`))
        uncovered.push(p.replace('dist/', ''))
    }
  }
  // Inline on* handlers would need 'unsafe-hashes', which the policy does not
  // grant — so one appearing is a silently-dead handler, not just a style note.
  const problems = [
    uncovered.length ? `${uncovered.length} of ${inline} inline scripts unhashed (${[...new Set(uncovered)].slice(0, 3).join(', ')})` : '',
    unsafeInline ? `${unsafeInline} policies still allow unsafe-inline` : '',
    handlers ? `${handlers} inline on* handlers would be blocked` : '',
  ].filter(Boolean)
  add(`all ${inline} inline scripts are CSP-hashed`, problems.length === 0, problems.join('; '))
}

// 6g. No `file:` dependencies — a deployability invariant.
//
//     package.json used to point bun-query-builder and ts-medium-editor at
//     directories OUTSIDE the repo. Neither is tracked by git, so a fresh
//     checkout has neither, and `bun install` handles it badly: it prints
//     "Failed to install 2 packages" and then EXITS 0. Netlify runs
//     `bun install && … && bun run build`, so the chain proceeds into a build
//     with no query builder — every getStaticPaths hook throws, all 108 dynamic
//     pages vanish, the SEO passes log "skipped", and the build claims success.
//
//     Both were local forks that upstream has since caught up with, so they are
//     plain registry versions now. This keeps it that way.
{
  const pkg = await Bun.file('package.json').json() as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const local = [
    ...Object.entries(pkg.dependencies ?? {}),
    ...Object.entries(pkg.devDependencies ?? {}),
  ].filter(([, spec]) => /^(?:file:|link:|\.\.?\/)/.test(spec))
  add(
    'no file:/link: dependencies',
    local.length === 0,
    local.map(([name, spec]) => `${name} -> ${spec}`).join(', '),
  )
}

// 6h. Dynamic routes: the build emitted a file for every id getStaticPaths
//     handed it, and the reference-data routes are not empty.
//
//     Two properties, reported as two checks on purpose, because they are two
//     different incidents with two different responses.
//
//     COMPLETENESS compares the build's INPUT (the ids each hook returns) to
//     its OUTPUT (files in dist). That makes it precise — it names the missing
//     ids — but it cannot see an empty database, because then both sides are
//     zero and it passes.
//
//     NON-EMPTINESS is the hardcoded expectation that closes that hole. With no
//     content every hook returns zero paths, no dynamic page is built, AND the
//     sitemap — built from the same queries — shrinks to match. The two then
//     agree, "every sitemap URL has a built file" stays true, and the gate waves
//     through an artifact that fell from 151 pages to 41. Agreement between two
//     outputs of the same broken query is not evidence that either is right.
//     This caught exactly that: a wiped dev database produced a green 15/15
//     build containing no judges and no courthouses.
//
//     It applies to judges and court-houses ONLY. Those are ingested reference
//     data, so empty means the import is gone and the build is broken.
//     /article/:id enumerates PUBLISHED REVIEWS — user-generated content — and a
//     directory nobody has reviewed yet correctly has none. Failing on that
//     asked for a fabricated published review about a real, named federal judge
//     to make the gate green, which is the exact thing the preceding commits
//     removed. Zero articles is now reported, not failed.
{
  // PRE-FLIGHT, before anything opens a connection.
  //
  // These are the only two checks that touch the database, and the first CI
  // run died here: a runner has no `.env`, so DB_CONNECTION is unset and
  // config/database.ts defaults to **mysql**, and the driver's failure
  // surfaced from its own connection teardown — an unhandled rejection that
  // killed the process rather than failing a check. A try/catch around the
  // query does not help, because the rejection does not come from the query.
  //
  // So decide up front whether a database is reachable, and never construct
  // the connection otherwise. bench runs on SQLite (config/database.ts,
  // DEPLOY.md); anything else, or a missing file, means these two checks
  // cannot run here.

  // Imported lazily, and only when there is something to connect to:
  // pulling staticPaths in constructs the db client as a side effect of the
  // module graph, which is exactly what must not happen here.
  const staticPaths = dbReachable ? await import('./app/Helpers/staticPaths') : null

  interface Route {
    label: string
    ids: () => Promise<{ paths: Array<{ params: Record<string, string> }> }>
    file: (id: string) => string
    /** Ingested reference data must be non-empty. User-generated content may not be. */
    reference: boolean
  }

  const routes: Route[] = !dbReachable ? [] : [
    // The canonical judge page, not judges/:id/profile: the profile tab is
    // deliberately no longer pre-rendered (six pages per judge OOM'd the build
    // at 20,028 pages).
    //
    // Naming the id-shaped file explicitly also repairs a hole the previous
    // `judges/*.html` glob had: that pattern matches submit.html, signup.html
    // and review.html, which exist on every build, so it counted a healthy 3
    // against a database holding no judges at all — defeating, for the busiest
    // route in the app, the one thing this check exists to catch.
    { label: 'judges', ids: staticPaths!.judgePaths, file: id => `judges/${id}.html`, reference: true },
    // The canonical courthouse page, not court-houses/:id/profile: the three
    // courthouse tabs are now served by one shared shell each, exactly like the
    // judge tabs above, so probing for a per-id profile file would report an
    // empty database on every healthy build. This is the drift that check
    // caught when the tabs were converted -- 202 of 202 "missing" -- which is
    // the check working, not failing.
    { label: 'court-houses', ids: staticPaths!.courtPaths, file: id => `court-houses/${id}.html`, reference: true },
    { label: 'article', ids: staticPaths!.articlePaths, file: id => `article/${id}.html`, reference: false },
  ]

  const missing: string[] = []
  const empty: string[] = []
  const pending: string[] = []

  // These two checks are the only ones that touch the database, and the
  // database is not always there. CI has no `.env`, so `DB_CONNECTION` is
  // unset and config/database.ts defaults to **mysql** — the gate died with
  // an unhandled `MySQLError: Failed to connect` the first time it ran on a
  // runner. A conformance gate should fail a CHECK, never explode: the
  // artifact it is examining is sitting right there either way.
  //
  // Unreachable database is reported, not failed, for the same reason empty
  // reference data is on a preview build — it says nothing about the commit.
  // An unreachable database on a RELEASE build is a different matter and is
  // treated as one.
  let dbError = dbReachable ? '' : dbSkipReason
  // Same release-candidate signal check 10 uses: with APP_URL set this build
  // is meant to ship, and both of these become hard failures.

  for (const route of dbReachable ? routes : []) {
    let ids: string[] = []
    try {
      ids = (await route.ids()).paths.map(p => p.params.id)
    }
    catch (err) {
      // Second line of defence: reachable, but the query still failed.
      dbError = err instanceof Error ? err.message : String(err)
      break
    }
    if (!ids.length) {
      ;(route.reference ? empty : pending).push(route.label)
      continue
    }
    const gone = ids.filter(id => !html.has(`dist/${route.file(id)}`))
    if (gone.length)
      missing.push(`${route.label}: ${gone.length} of ${ids.length} missing (e.g. ${gone.slice(0, 3).map(id => route.file(id)).join(', ')})`)
  }

  add(
    'every getStaticPaths id has a built page',
    dbError ? !isReleaseBuild : missing.length === 0,
    dbError
      ? `database unreachable (${dbError.slice(0, 80)}) — this check needs it to enumerate ids${isReleaseBuild ? '' : '. APP_URL is unset, so this is reported rather than failed'}`
      : (missing.length
          ? `${missing.join('; ')} — getStaticPaths returned these ids and the build emitted no file for them`
          : pending.map(l => `${l}: no ids yet, so no pages — correct for user-generated content until the first one is published`).join('; ')),
  )

  // Strictness follows the same signal check 10 uses to decide whether this
  // artifact is a release candidate. A build with APP_URL set is meant to
  // ship, and shipping a directory with no judges in it is a hard failure. A
  // build without APP_URL is a local preview or a CI run on a machine that
  // has never run the importer — there, empty reference data is the expected
  // state, not a defect, and failing on it would make the gate unusable in
  // exactly the place it is most worth running.
  add(
    'reference-data routes are not empty',
    dbError ? !isReleaseBuild : (empty.length === 0 || !isReleaseBuild),
    dbError
      ? `database unreachable (${dbError.slice(0, 80)}) — reference data could not be counted${isReleaseBuild ? '' : '. APP_URL is unset, so this is reported rather than failed'}`
      : (empty.length
          ? `no ids for: ${empty.join(', ')} — these come from the CourtListener/Wikidata import, so an empty result means the import is missing, not that content is pending (run \`bun scripts/ingest-courtlistener.ts\`)${isReleaseBuild ? '' : '. APP_URL is unset, so this is reported rather than failed — a preview build is not expected to carry imported data'}`
          : ''),
  )
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

// 10. No page ships a cloak that nothing will lift.
//
//     stx hides un-hydrated markup with x-cloak + `[x-cloak]{display:none}`,
//     then removes the attribute once a scope hydrates. Every removal site in
//     the runtime is scope-relative — `el.removeAttribute('x-cloak')` plus
//     `el.querySelectorAll('[x-cloak]')` — and querySelectorAll only reaches
//     DESCENDANTS. So a cloak landing on a layout element ABOVE every
//     [data-stx-scope] root is never lifted, and the whole content region
//     stays display:none forever.
//
//     That is reachable by accident. The build-time heuristic decides whether
//     a tag "contains" an interpolation by scanning from its `>` to the first
//     `</` in the REST OF THE DOCUMENT, so a run of nested opening tags with
//     no closing tag before the first {{ }} cloaks every ancestor in the run.
//     A self-closing <img /> does not terminate the scan. /profile hit exactly
//     this: six nested divs, a self-closing avatar, then {{ displayName }} —
//     <main> was cloaked and the page rendered header and footer around a
//     completely blank body, while the console showed a healthy 200, correct
//     auth and every signal resolving. Nothing else in this gate sees it,
//     because the markup IS all present in the HTML; it is only invisible.
//
//     Checking <main> and <body> alone was too narrow. /judges/:id/reviews
//     shipped the cloak one level lower — on the page container div inside
//     <main> — and the whole reviews tab rendered blank: the judge's rating
//     distribution, every review, the pagination. Found by walking the stack
//     instead, then confirmed in a browser (exactly one [x-cloak] left after
//     hydration, computed display:none, with all six scopes hydrated).
//
//     The exemption is pages whose view compiles a setup block. Those get a
//     container-wide hydration pass that lifts every cloak under the content
//     root, so a cloak outside a scope is harmless there — /home carries 50
//     of them and ends up with zero after hydration, measured. A view that
//     only pulls in components compiles no setup block and gets no such pass,
//     so there the scope roots are the only thing lifting anything.
{
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
  const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g

  const stuck: string[] = []
  for (const [path, doc] of html) {
    // A view-level setup block means a container-wide uncloak pass runs.
    if (doc.includes('__stx_setup_'))
      continue
    const stack: { tag: string, scope: boolean }[] = []
    let scopeDepth = 0
    let m: RegExpExecArray | null
    TAG.lastIndex = 0
    while ((m = TAG.exec(doc))) {
      const [, slash, rawTag, attrs, selfClose] = m
      const tag = rawTag.toLowerCase()
      if (slash) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            for (let j = stack.length - 1; j >= i; j--) if (stack[j].scope) scopeDepth--
            stack.length = i
            break
          }
        }
        continue
      }
      const scope = /\sdata-stx-scope=/.test(attrs)
      const cloak = /(?:^|\s)x-cloak(?:[=\s/]|$)/.test(attrs)
      // A cloak on the scope root itself is fine — the root removes its own.
      if (cloak && !scope && scopeDepth === 0)
        stuck.push(`${path.replace('dist/', '')}: <${tag}${attrs.match(/\sclass="([^"]*)"/) ? ` class="${attrs.match(/\sclass="([^"]*)"/)![1].slice(0, 50)}"` : ''}>`)
      if (!VOID.has(tag) && !selfClose) {
        stack.push({ tag, scope })
        if (scope) scopeDepth++
      }
    }
  }
  add(
    'no page ships a cloak that nothing will lift',
    stuck.length === 0,
    stuck.length
      ? `${stuck.length} elements over ${new Set(stuck.map(h => h.split(': ')[0])).size} pages stay display:none forever — move the element inside a component so it becomes the scope root: ${stuck.slice(0, 3).join(' | ')}`
      : '',
  )
}

// 19. No page PAINTS a hidden-class toggle.
//
//     `x-class="cond() ? '' : 'hidden'"` is evaluated in the browser, so the
//     pre-rendered page ships the element with no `hidden` in its static class
//     list and paints it until the runtime boots. The whole site did this:
//     /verify-email showed all four of its mutually exclusive outcomes at once,
//     /reviews laid its full-screen "Report this review" dialog over the page,
//     /login told every visitor their session had expired, and the header
//     dropdown hung open on all 2990 pages. stx-standards 7.3's `:show` is the
//     fix because stx stamps x-cloak on `:show` elements at BUILD time.
//
//     An x-class toggle under a cloaked ancestor is fine — a cloaked parent
//     does not paint its children — so this walks the tag stack rather than
//     grepping, which is also how it sees `fixed` overlays that a browser probe
//     filtering on `offsetParent` silently misses. That is how the /reviews
//     dialog was found, after the browser pass had called the page clean.
{
  // Toggles whose element is CORRECT to paint: the condition is true on
  // arrival, so cloaking them would trade a flash-out for a flash-in.
  const STARTS_VISIBLE = new Set([
    // home.stx — anonymous CTA band; most of this page's traffic is anonymous.
    `isAnonymous() ? '' : 'hidden'`,
    // SettingsView.stx — "Delete account" button, hidden only once confirming.
    `confirmingDelete() ? 'hidden' : ''`,
    // ReviewForm.stx — the judge search, which is the page's whole content
    // until a judge is picked.
    `(!judge() && !submitted()) ? '' : 'hidden'`,
    // JudgeSignup.stx — "sign in first" prompt; whoever lands on
    // /judges/signup is not signed in yet.
    `!isAuthed() ? '' : 'hidden'`,
    // NewsletterSignup.stx — the footer signup form, on every page. Correct
    // to paint on arrival (anyone can subscribe); it steps aside only once
    // somebody has signed up during this visit.
    `showForm() ? '' : 'hidden'`,
    // admin/login.stx — the email+password step of admin login. It is the
    // state the page arrives in; the emailed-code step it hands off to is the
    // one that must not paint (bench-review#56).
    `codeStep() ? 'hidden' : ''`,
  ])
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
  const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g

  const painted: string[] = []
  for (const [path, doc] of html) {
    const stack: { tag: string, cloak: boolean }[] = []
    let cloakDepth = 0
    let m: RegExpExecArray | null
    TAG.lastIndex = 0
    while ((m = TAG.exec(doc))) {
      const [, slash, rawTag, attrs, selfClose] = m
      const tag = rawTag.toLowerCase()
      if (slash) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            for (let j = stack.length - 1; j >= i; j--) if (stack[j].cloak) cloakDepth--
            stack.length = i
            break
          }
        }
        continue
      }
      const cloak = /(?:^|\s)x-cloak(?:[=\s/]|$)/.test(attrs)
      const toggle = attrs.match(/\sx-class="([^"]*)"/)
      if (toggle && /'[a-z-]*hidden'/.test(toggle[1]) && cloakDepth === 0 && !cloak && !STARTS_VISIBLE.has(toggle[1]))
        painted.push(`${path.replace('dist/', '')}: ${toggle[1]}`)
      if (!VOID.has(tag) && !selfClose) {
        stack.push({ tag, cloak })
        if (cloak) cloakDepth++
      }
    }
  }
  const unique = [...new Set(painted.map(h => h.split(': ')[1]))]
  add(
    'no page paints a hidden-class toggle',
    painted.length === 0,
    painted.length
      ? `${painted.length} elements over ${new Set(painted.map(h => h.split(':')[0])).size} pages paint before JS — use :show + style="display:none" (stx-standards 7.3), or add to STARTS_VISIBLE if the element is meant to be visible on arrival: ${unique.slice(0, 4).join(' | ')}`
      : '',
  )
}

// 20. Every page declares a colour scheme.
//
//     bench renders light-only — not one `dark:` variant exists in any
//     template — but nothing in the built page painted a background, so the
//     canvas was whatever the user agent chose, and a browser in dark mode
//     chooses black. Every page served dark grey text on black. Three things
//     had to be missing at once and all three were: the SSG drops
//     `app.bodyClass`, the class it asks for (`bg-off-white`) names a colour
//     that does not exist in the theme so crosswind emits no rule for it, and
//     there was no `color-scheme` meta. See app/Helpers/colorScheme.ts.
//
//     Checked here rather than in a template because the declaration is a
//     post-build splice, like the webfont and CSP tags — a template-side test
//     would pass while the artifact shipped without it.
{
  const bare: string[] = []
  for (const [p, h] of html) {
    if (!/<meta\s+name="color-scheme"/i.test(h))
      bare.push(p.replace('dist/', ''))
  }
  add(
    'every page declares a colour scheme',
    bare.length === 0,
    bare.length ? `${bare.length} pages ship no color-scheme meta (${bare.slice(0, 3).join(', ')}) — they render dark-on-dark for anyone whose browser is in dark mode` : '',
  )
}

// 21. Every notification type is spelled out on both surfaces.
//
//     The bell dropdown (Bench/BenchHeader `notificationLabel`) and the
//     /notifications page (Bench/NotificationsView `labelFor` + `detailFor`)
//     each carry their own copy of the type-to-wording mapping. They cannot
//     share a module: the stx bundler silently drops value imports from
//     outside resources/stores, so an extracted helper would arrive as
//     undefined at scope-setup time.
//
//     Neither function throws on a type it does not know — both fall through
//     to a bare "New notification" — so a type added to NotificationType and
//     wired into a dispatch site, but missed in one of these, ships a
//     delivered, clickable, meaningless row. Nothing else in the build would
//     notice. This check reads the union from app/Helpers/notifications.ts
//     and requires each member on both surfaces.
{
  const src = await Bun.file('app/Helpers/notifications.ts').text()
  const union = src.match(/export type NotificationType\s*=\s*([^\n]+)/)?.[1] ?? ''
  const types = [...union.matchAll(/'([a-z_]+)'/g)].map(m => m[1])

  const surfaces: Array<{ fn: string, path: string }> = [
    { fn: 'notificationLabel', path: 'resources/components/Bench/BenchHeader.stx' },
    { fn: 'labelFor', path: 'resources/components/Bench/NotificationsView.stx' },
  ]

  // Scope the search to the LABEL function's own body. A file-wide search is
  // not enough and was wrong on the first attempt: NotificationsView also has
  // detailFor, so deleting a case from labelFor left the type still mentioned
  // in the file and the check passed a page that had lost its wording. Only
  // the label matters — detailFor falling through to '' just omits a
  // subtitle, which is a fine outcome for a type that needs no elaboration.
  function bodyOf(src: string, fn: string): string {
    const start = src.indexOf(`function ${fn}(`)
    if (start === -1) return ''
    const end = src.indexOf('\n  }', start)
    return end === -1 ? src.slice(start) : src.slice(start, end)
  }

  const missing: string[] = []
  for (const surface of surfaces) {
    const src = await Bun.file(surface.path).text()
    const body = bodyOf(src, surface.fn)
    if (!body) {
      missing.push(`${surface.path} has no ${surface.fn}()`)
      continue
    }
    for (const t of types) {
      // The wording differs per surface; what has to exist is a branch on
      // the type at all.
      if (!body.includes(`n.type === '${t}'`))
        missing.push(`${surface.fn}() has no case for '${t}'`)
    }
  }

  add(
    'every notification type is worded on both surfaces',
    types.length > 0 && missing.length === 0,
    types.length === 0
      ? 'could not read the NotificationType union from app/Helpers/notifications.ts'
      : (missing.length ? `${missing.join(', ')} — the fallback is a bare "New notification", so the row ships delivered and meaningless` : ''),
  )
}

// 22. Nothing removes the focus outline without putting one back.
//
//     `focus:outline-none` with no replacement is WCAG 2.4.7: a keyboard
//     user loses track of where they are. bench had this on the review
//     form's star rows, which is the core conversion flow — five unnamed
//     buttons with no visible focus.
//
//     The second half is the one a human reviewer misses. An element can
//     carry its replacement in only SOME x-class branches: the review form's
//     title input paired `focus:outline-none` with a focus ring in its
//     healthy branch and nothing at all in its error branch, so the field
//     had no focus indicator at precisely the moment it was flagged invalid
//     and the user was sent back to it. Both shapes are checked here.
//
//     Source files, not dist, because an x-class branch is the thing being
//     inspected and the built page only ever shows one of them.
{
  const TAG = /<(\w[\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  const REPLACEMENT = ['focus:ring', 'focus-visible:', 'focus:border', 'focus-within:ring', 'focus:shadow']
  const hasReplacement = (s: string): boolean => REPLACEMENT.some(k => s.includes(k))

  const bare: string[] = []
  const partial: string[] = []

  for await (const path of new Bun.Glob('resources/**/*.stx').scan('.')) {
    const src = await Bun.file(path).text()
    TAG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TAG.exec(src))) {
      const attrs = m[2]
      if (!attrs.includes('focus:outline-none'))
        continue
      const line = src.slice(0, m.index).split('\n').length
      const where = `${path}:${line} <${m[1]}>`

      if (hasReplacement(attrs.match(/\sclass="([^"]*)"/)?.[1] ?? ''))
        continue

      const xclass = attrs.match(/x-class="([^"]*)"/)?.[1]
      if (!xclass) {
        bare.push(where)
        continue
      }
      // Every branch the toggle can land on has to carry its own.
      const branches = [...xclass.matchAll(/'([^']*)'/g)].map(b => b[1]).filter(Boolean)
      if (branches.some(b => !hasReplacement(b)))
        partial.push(where)
    }
  }

  const all = [...bare, ...partial]
  add(
    'nothing removes the focus outline without a replacement',
    all.length === 0,
    all.length
      ? `${all.length} element(s) suppress focus-visible styling with no visible replacement${partial.length ? ` (${partial.length} only in some x-class branches)` : ''}: ${all.slice(0, 3).join(', ')}`
      : '',
  )
}

// 23. Every shipped image is actually an image.
//
//     Fifteen of the PNGs under public/images were undecodable: their
//     signature read `89 50 4e 47 0a 1a 0a` — the `0d` stripped by a
//     text-mode transfer somewhere upstream, every CRLF in the file
//     collapsed to LF. They had been committed that way since May 2025 and
//     shipped in every artifact since (#93).
//
//     Nothing catches this otherwise. The build copies them without looking,
//     `fetch()` returns 200 with `content-type: image/png`, and only an
//     actual decode attempt fails — so it reads as a loading problem rather
//     than a corrupt file. It cost an hour of debugging the wrong layer when
//     one was picked as a test fixture.
//
//     Magic bytes rather than a real decode: this class of damage is a
//     mangled header, and a dependency-free check that runs over every
//     shipped image in milliseconds is worth more here than a thorough one
//     that needs a decoder.
{
  const SIGNATURES: Array<{ ext: string[], label: string, ok: (b: Uint8Array) => boolean }> = [
    { ext: ['.png'], label: 'PNG', ok: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A },
    { ext: ['.jpg', '.jpeg'], label: 'JPEG', ok: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
    { ext: ['.gif'], label: 'GIF', ok: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
    // RIFF....WEBP
    { ext: ['.webp'], label: 'WebP', ok: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
    { ext: ['.ico'], label: 'ICO', ok: b => b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) },
  ]

  const broken: string[] = []
  let checked = 0
  for await (const path of new Bun.Glob('dist/**/*.{png,jpg,jpeg,gif,webp,ico}').scan('.')) {
    const lower = path.toLowerCase()
    const sig = SIGNATURES.find(s2 => s2.ext.some(e => lower.endsWith(e)))
    if (!sig)
      continue
    checked++
    const head = new Uint8Array(await Bun.file(path).slice(0, 16).arrayBuffer())
    if (head.byteLength < 12 || !sig.ok(head))
      broken.push(`${path.replace('dist/', '')} (not a ${sig.label})`)
  }

  add(
    `all ${checked} shipped images decode`,
    broken.length === 0,
    broken.length
      ? `${broken.length} file(s) have a corrupt header and will not render: ${broken.slice(0, 4).join(', ')}`
      : '',
  )
}

// 24. The signup form is actually protected in a release build.
//
//     Both halves of the Turnstile check degrade to "off" when unconfigured,
//     and they do it quietly and independently: no TURNSTILE_SITE_KEY and
//     build.ts ships the form without a widget; no TURNSTILE_SECRET_KEY and
//     verifyTurnstile() passes everything through. That pairing is correct
//     for local development and indistinguishable, from the outside, from a
//     production deploy whose keys were never set.
//
//     So this asserts the artifact and the environment agree, and only for a
//     release build (APP_URL on a real host). A keyless local build reports
//     rather than fails, exactly like the database-dependent checks above.
{
  const siteKey = (process.env.TURNSTILE_SITE_KEY ?? '').trim()
  const secret = (process.env.TURNSTILE_SECRET_KEY ?? '').trim()
  const signupPath = pages.find(p => p.endsWith('register.html'))
  const widgetShipped = !!signupPath && (html.get(signupPath) ?? '').includes('challenges.cloudflare.com')

  const problems: string[] = []
  if (!siteKey)
    problems.push('TURNSTILE_SITE_KEY is unset, so the signup form ships with no widget')
  if (!secret)
    problems.push('TURNSTILE_SECRET_KEY is unset, so the server accepts any signup')
  if (siteKey && !widgetShipped)
    problems.push('a site key is set but register.html carries no widget — the build step did not run')

  add(
    'the signup form carries a working Turnstile check',
    isReleaseBuild ? problems.length === 0 : true,
    problems.length === 0
      ? ''
      : `${problems.join('; ')}${isReleaseBuild ? '' : '. APP_URL is not a real host, so this is reported rather than failed'}`,
  )
}

const failed = checks.filter(c => !c.ok)
console.log(`\n  bench conformance gate — ${pages.length} built pages\n`)
for (const c of checks)
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `\n      ${c.detail}` : ''}`)
console.log(failed.length ? `\n  ${failed.length} of ${checks.length} checks FAILED\n` : `\n  all ${checks.length} checks passed\n`)
process.exit(failed.length ? 1 : 0)
