/**
 * Per-page SEO head injection for the static build.
 *
 * The stx#1756 fix hoists a per-page <title> into static HTML, but per-page
 * <meta description>, <link canonical>, and Open Graph / Twitter tags are
 * NOT rendered into the static <head> by useHead / useSeoMeta / @head (those
 * only take effect client-side). Social scrapers and the first crawl wave
 * never run JS, so they'd see the generic default.
 *
 * build.ts calls injectSeoHead() over the built dist/*.html for each known
 * route, splicing canonical + OG + Twitter + a real description into the
 * static <head>. URLs derive from the build's APP_URL (the `base`), so the
 * tags match the deploy domain. Dynamic per-judge pages aren't here yet —
 * they need build-time static generation (#46).
 */

interface PageSeo {
  /** Public path, e.g. '/judges'. Canonical + og:url = base + path. */
  path: string
  /** Per-page meta description (replaces the global default). */
  description: string
  /** Optional og:description override; falls back to `description`. */
  ogDescription?: string
}

/** dist filename -> SEO. Static, indexable pages only. */
export const SEO_PAGES: Record<string, PageSeo> = {
  'home.html': {
    path: '/',
    description: 'Bench Review is a public directory of judges with first-hand reviews from attorneys, clerks, and court staff. Search judges by name and court.',
  },
  'judges.html': {
    path: '/judges',
    description: 'Browse and search judges across the United States. Read reviews from the attorneys, clerks, and court staff who appear before them.',
  },
  'reviews.html': {
    path: '/reviews',
    description: 'The latest judge reviews on Bench Review: honest, first-hand accounts of courtroom conduct, temperament, and fairness.',
  },
  'court-houses.html': {
    path: '/court-houses',
    description: 'Explore courthouses and the judges who sit in them. Bench Review maps the bench so you know what to expect before you appear.',
  },
  'faq.html': {
    path: '/faq',
    description: 'Answers to common questions about Bench Review: who can write reviews, how moderation works, and how judges can respond.',
  },
  'about.html': {
    path: '/about',
    description: 'About Bench Review: bringing transparency to the judiciary with reviews from the people who appear before judges.',
  },
  'guidelines.html': {
    path: '/guidelines',
    description: 'Community and content guidelines for writing reviews of judges on Bench Review, including our judicial-privacy rules.',
  },
  'contact.html': {
    path: '/contact',
    description: 'Contact Bench Review: report a review, request removal of personal information, or get in touch with our team.',
  },
  'terms.html': {
    path: '/terms',
    description: 'Bench Review Terms of Service.',
  },
  'privacy.html': {
    path: '/privacy',
    description: 'Bench Review Privacy Policy: what we collect, how we use it, and your data rights.',
  },
  'search.html': {
    path: '/search',
    description: 'Search Bench Review for a judge by name or court.',
  },
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Extract the page's existing <title> text for og:title / twitter:title. */
function extractTitle(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i)
  return m?.[1]?.trim() || 'Bench Review'
}

/**
 * Inject canonical + OG + Twitter + description into one page's <head>.
 * Returns the rewritten HTML (or the original if it has no </head>).
 */
export function injectSeoHead(html: string, seo: PageSeo, base: string): string {
  if (!html.includes('</head>'))
    return html

  const url = `${base}${seo.path}`
  const title = extractTitle(html)
  const ogDesc = seo.ogDescription ?? seo.description
  const ogImage = `${base}/images/og-image.png`

  const tags = [
    `<link rel="canonical" href="${escapeAttr(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Bench Review">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(ogDesc)}">`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(ogDesc)}">`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`,
  ].join('\n  ')

  // Replace the (default) description with the per-page one if present,
  // otherwise add it. Then splice the canonical/OG block before </head>.
  let out = html
  const descTag = `<meta name="description" content="${escapeAttr(seo.description)}">`
  if (/<meta\s+name="description"[^>]*>/i.test(out))
    out = out.replace(/<meta\s+name="description"[^>]*>/i, descTag)
  else
    out = out.replace('</head>', `  ${descTag}\n</head>`)

  return out.replace('</head>', `  ${tags}\n</head>`)
}
