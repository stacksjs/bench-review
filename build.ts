#!/usr/bin/env bun
import { buildApp } from '@stacksjs/stx'
import { buildRobotsTxt, buildSitemapXml, normalizeBase } from './app/Helpers/sitemap'

// eslint-disable-next-line ts/no-top-level-await
await buildApp()

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
