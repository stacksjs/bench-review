import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { response } from '@stacksjs/router'

/**
 * GET /sitemap.xml — generates an XML sitemap covering every public
 * URL in bench-review, derived from the current database content.
 *
 * Replaces the stale build-time `dist/sitemap.xml` that was last
 * generated against pre-launch fixtures. Live generation means a new
 * judge, courthouse, or published review shows up in Google's crawl
 * within hours of landing in the DB instead of waiting for the next
 * build cycle.
 *
 * Cache strategy: served with a `Cache-Control: public, max-age=3600`
 * so search bots (and any CDN in front) hold the response for an hour.
 * Sitemap freshness within a one-hour window is plenty; the heavy
 * lifting here is the three SELECTs that join nothing — sub-millisecond
 * even at 10k+ rows.
 *
 * Resolves bench-review#33 (sitemap + robots part).
 */
export default new Action({
  name: 'Sitemap',
  description: 'Dynamic XML sitemap built from judges, courthouses, and published reviews',
  method: 'GET',
  async handle() {
    const base = (process.env.APP_URL || 'http://localhost:4000').replace(/\/+$/, '')

    // Static public pages — anything a guest can land on. Keep in
    // sync with `resources/views/*` when adding a new public route.
    const staticPaths: Array<{ path: string, priority: number, changefreq: string }> = [
      { path: '/', priority: 1.0, changefreq: 'daily' },
      { path: '/judges', priority: 0.9, changefreq: 'daily' },
      { path: '/court-houses', priority: 0.9, changefreq: 'weekly' },
      { path: '/reviews', priority: 0.9, changefreq: 'daily' },
      { path: '/search', priority: 0.5, changefreq: 'monthly' },
      { path: '/about', priority: 0.3, changefreq: 'monthly' },
      { path: '/faq', priority: 0.3, changefreq: 'monthly' },
      { path: '/contact', priority: 0.3, changefreq: 'monthly' },
      { path: '/privacy', priority: 0.2, changefreq: 'yearly' },
      { path: '/terms', priority: 0.2, changefreq: 'yearly' },
      { path: '/login', priority: 0.4, changefreq: 'yearly' },
      { path: '/register', priority: 0.5, changefreq: 'yearly' },
    ]

    // Dynamic — every judge gets a /judges/:id/profile entry, every
    // courthouse gets /court-houses/:id/profile, every PUBLISHED
    // review gets /article/:id. We deliberately omit pending and
    // rejected reviews so the sitemap matches what readers actually
    // see; if Google indexes a URL that returns 404 to anonymous
    // visitors, it counts against crawl budget.
    const [judges, courts, reviews] = await Promise.all([
      (db.selectFrom('judges' as any) as any)
        .select(['id', 'updated_at'])
        .execute() as Promise<Array<{ id: number, updated_at: string | null }>>,
      (db.selectFrom('court_houses' as any) as any)
        .select(['id', 'updated_at'])
        .execute() as Promise<Array<{ id: number, updated_at: string | null }>>,
      (db.selectFrom('judge_reviews' as any) as any)
        .select(['id', 'updated_at'])
        .where('status' as any, '=', 'published')
        .execute() as Promise<Array<{ id: number, updated_at: string | null }>>,
    ])

    // Build the URL set. <lastmod> uses the row's updated_at when
    // present so Google's "what changed" hint stays accurate; falls
    // back to today's date for static pages and rows missing updated_at.
    const today = new Date().toISOString().slice(0, 10)
    const toLastMod = (raw: string | null): string => {
      if (!raw) return today
      // Accept ISO timestamps or date-only; trim to YYYY-MM-DD for the
      // sitemap spec (timestamps are valid but YYYY-MM-DD is the most
      // widely supported across crawlers).
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? today : d.toISOString().slice(0, 10)
    }

    const entries: string[] = []

    for (const s of staticPaths) {
      entries.push(`  <url>
    <loc>${base}${s.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${s.changefreq}</changefreq>
    <priority>${s.priority.toFixed(1)}</priority>
  </url>`)
    }

    for (const j of judges) {
      entries.push(`  <url>
    <loc>${base}/judges/${j.id}/profile</loc>
    <lastmod>${toLastMod(j.updated_at)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`)
    }

    for (const c of courts) {
      entries.push(`  <url>
    <loc>${base}/court-houses/${c.id}/profile</loc>
    <lastmod>${toLastMod(c.updated_at)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`)
    }

    for (const r of reviews) {
      entries.push(`  <url>
    <loc>${base}/article/${r.id}</loc>
    <lastmod>${toLastMod(r.updated_at)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`)
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }) as any
  },
})
