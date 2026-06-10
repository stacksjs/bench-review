#!/usr/bin/env bun
import { buildApp } from '@stacksjs/stx'
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
