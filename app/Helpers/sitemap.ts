import { db } from '@stacksjs/database'

/**
 * Shared sitemap + robots builders.
 *
 * Used both at runtime (GET /api/sitemap.xml via SitemapAction) and at
 * build time (build.ts writes dist/sitemap.xml + dist/robots.txt). Keeping
 * one source of truth means the static artifact a host serves and the live
 * endpoint never drift, and both derive their absolute URLs from the same
 * `base` (APP_URL) instead of a hardcoded host.
 */

/** Public static pages a guest can land on. Test/internal pages
 *  (/jtest, /secret-marketing, /paywall) are deliberately absent. */
const STATIC_PATHS: Array<{ path: string, priority: number, changefreq: string }> = [
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

/** Normalize a base URL: trim trailing slashes so `${base}${path}` is clean. */
export function normalizeBase(raw: string | undefined): string {
  return (raw || 'http://localhost:4000').replace(/\/+$/, '')
}

/**
 * Build the full sitemap XML from current DB content. Every judge gets a
 * /judges/:id/profile entry, every courthouse /court-houses/:id/profile,
 * every PUBLISHED review /article/:id (pending/rejected omitted so the
 * sitemap matches what anonymous visitors actually see).
 */
export async function buildSitemapXml(base: string): Promise<string> {
  const [judges, courts, reviews] = await Promise.all([
    (db.selectFrom('judges') as any)
      .select(['id', 'updated_at'])
      .execute() as Promise<Array<{ id: number, updated_at: string | null }>>,
    (db.selectFrom('court_houses') as any)
      .select(['id', 'updated_at'])
      .execute() as Promise<Array<{ id: number, updated_at: string | null }>>,
    (db.selectFrom('judge_reviews') as any)
      .select(['id', 'updated_at'])
      .where('status', '=', 'published')
      .execute() as Promise<Array<{ id: number, updated_at: string | null }>>,
  ])

  const today = new Date().toISOString().slice(0, 10)
  const toLastMod = (raw: string | null): string => {
    if (!raw) return today
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? today : d.toISOString().slice(0, 10)
  }

  const entries: string[] = []

  for (const s of STATIC_PATHS) {
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`
}

/**
 * Build robots.txt with an absolute Sitemap URL derived from `base`.
 * The Sitemap points at the apex /sitemap.xml (not /api/), and test /
 * internal pages are disallowed so a stray index doesn't surface them.
 */
export function buildRobotsTxt(base: string): string {
  return `# Bench Review crawl policy
User-agent: *
Allow: /

# Surfaces that should never be indexed:
Disallow: /api/
Disallow: /admin/
Disallow: /settings
Disallow: /notifications
Disallow: /my-reviews
Disallow: /reset-password
Disallow: /forgot-password
# Test / internal-only pages:
Disallow: /jtest
Disallow: /secret-marketing
Disallow: /paywall

Sitemap: ${base}/sitemap.xml
`
}
