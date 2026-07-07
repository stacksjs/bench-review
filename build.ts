#!/usr/bin/env bun
import { buildApp } from '@stacksjs/stx'
import { tsAnalyticsTag } from '@stacksjs/ts-analytics/stx'
import { TS_ANALYTICS_APP_ID } from './config/ts-analytics'
import { cspMetaTag } from './app/Helpers/cspMeta'
import { injectSeoHead, SEO_PAGES } from './app/Helpers/seoPages'
import { buildRobotsTxt, buildSitemapXml, normalizeBase } from './app/Helpers/sitemap'

// eslint-disable-next-line ts/no-top-level-await
await buildApp()

// Per-page SEO head injection. useHead/useSeoMeta/@head only take effect
// client-side, so canonical + OG + Twitter + per-page description never
// reach the static <head> that crawlers and social scrapers read. Splice
// them in here, with URLs derived from APP_URL. (Per-judge pages need
// build-time static generation first — #46.)
try {
  const seoBase = normalizeBase(process.env.APP_URL)
  let injected = 0
  for (const [file, seo] of Object.entries(SEO_PAGES)) {
    const path = `dist/${file}`
    const f = Bun.file(path)
    // eslint-disable-next-line ts/no-top-level-await
    if (!(await f.exists()))
      continue
    // eslint-disable-next-line ts/no-top-level-await
    const html = await f.text()
    // eslint-disable-next-line ts/no-top-level-await
    await Bun.write(path, injectSeoHead(html, seo, seoBase))
    injected++
  }
  console.log(`[build] injected SEO head into ${injected} static pages`)
}
catch (err) {
  console.warn('[build] SEO head injection skipped:', err instanceof Error ? err.message : err)
}

// ts-analytics: inject the shared tracker into every built page's <head>.
// buildApp()'s SSG output ignores config.app.head, so — like the SEO step
// above — splice the tag in post-build. Keyed by App ID (shared with
// stx.config.ts via config/ts-analytics.ts, so serve + static match); the
// endpoint is baked into the integration (override via TS_ANALYTICS_ENDPOINT).
try {
  const tag = tsAnalyticsTag({ appId: TS_ANALYTICS_APP_ID })
  if (tag) {
    const glob = new Bun.Glob('**/*.html')
    let injected = 0
    // eslint-disable-next-line ts/no-top-level-await
    for await (const file of glob.scan('dist')) {
      const path = `dist/${file}`
      // eslint-disable-next-line ts/no-top-level-await
      const html = await Bun.file(path).text()
      if (!html.includes('</head>') || html.includes(tag))
        continue
      // eslint-disable-next-line ts/no-top-level-await
      await Bun.write(path, html.replace('</head>', `${tag}</head>`))
      injected++
    }
    console.log(`[build] injected ts-analytics into ${injected} static pages`)
  }
}
catch (err) {
  console.warn('[build] ts-analytics injection skipped:', err instanceof Error ? err.message : err)
}

// Content-Security-Policy (bench-review#3 hardening). Splice a CSP <meta>
// into every built page's <head>, same post-build mechanism as the SEO +
// analytics steps. Ships only the provably-non-breaking baseline
// (object-src/base-uri/form-action); the exfil-blocking connect/img/script
// directives are env-dependent and must be verified against a live app
// before enabling — see app/Helpers/cspMeta.ts. Best-effort + idempotent.
try {
  const tag = cspMetaTag()
  const glob = new Bun.Glob('**/*.html')
  let injected = 0
  // eslint-disable-next-line ts/no-top-level-await
  for await (const file of glob.scan('dist')) {
    const path = `dist/${file}`
    // eslint-disable-next-line ts/no-top-level-await
    const html = await Bun.file(path).text()
    if (!html.includes('</head>') || html.includes('http-equiv="Content-Security-Policy"'))
      continue
    // eslint-disable-next-line ts/no-top-level-await
    await Bun.write(path, html.replace('</head>', `${tag}</head>`))
    injected++
  }
  console.log(`[build] injected CSP meta into ${injected} static pages`)
}
catch (err) {
  console.warn('[build] CSP meta injection skipped:', err instanceof Error ? err.message : err)
}

// buildApp() emits a page-derived dist/sitemap.xml hardcoded to localhost
// and listing internal/test pages. Overwrite it (and robots.txt) with the
// DB-derived sitemap whose absolute URLs come from APP_URL, so the static
// artifacts a host serves match the deploy domain. Best-effort: a missing
// or unmigrated DB at build time must not fail the whole build.
try {
  const base = normalizeBase(process.env.APP_URL)
  // eslint-disable-next-line ts/no-top-level-await
  const xml = await buildSitemapXml(base)
  // eslint-disable-next-line ts/no-top-level-await
  await Bun.write('dist/sitemap.xml', xml)
  // eslint-disable-next-line ts/no-top-level-await
  await Bun.write('dist/robots.txt', buildRobotsTxt(base))
  console.log(`[build] wrote dist/sitemap.xml + dist/robots.txt (base: ${base})`)
}
catch (err) {
  console.warn('[build] sitemap/robots generation skipped:', err instanceof Error ? err.message : err)
}
