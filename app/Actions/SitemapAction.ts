import { Action } from '@stacksjs/actions'
import { buildSitemapXml, normalizeBase } from '../Helpers/sitemap'

/**
 * GET /api/sitemap.xml — XML sitemap covering every public URL, derived
 * from current database content.
 *
 * The build (build.ts) writes the same content to dist/sitemap.xml so a
 * static host can serve it at the apex; this endpoint is the live-fresh
 * variant. Both share app/Helpers/sitemap.ts so they never drift.
 *
 * Cache: `public, max-age=3600` — an hour of staleness is fine, and the
 * three SELECTs join nothing (sub-ms even at 10k+ rows).
 *
 * Resolves bench-review#33 (sitemap + robots part).
 */
export default new Action({
  name: 'Sitemap',
  description: 'Dynamic XML sitemap built from judges, courthouses, and published reviews',
  method: 'GET',
  async handle() {
    const base = normalizeBase(process.env.APP_URL)
    const xml = await buildSitemapXml(base)

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }) as any
  },
})
