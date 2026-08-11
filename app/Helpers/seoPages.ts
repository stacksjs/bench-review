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
  'blog.html': {
    path: '/blog',
    description: 'Writing from Bench Review on judicial transparency, courtroom practice, and what the review data shows about the bench.',
  },
}

/**
 * Pages that should never appear in an index, keyed the same way as SEO_PAGES.
 *
 * Deliberately NOT a mirror of robots.txt's Disallow list: a disallowed path
 * is never fetched, so a `noindex` on it is never read — the two mechanisms
 * are alternatives, not layers. These are the pages a crawler CAN reach and
 * shouldn't keep: error pages carry no content, and the verify-email landing
 * is one half of a token flow.
 *
 * 500.html declares its own `noindex` inline (it's a standalone document with
 * its own <head>, not a layout-extending view) and so isn't listed here.
 */
export const NOINDEX_PAGES: string[] = [
  '404.html',
  'verify-email.html',
]

/** Add `<meta name="robots" content="noindex">` unless the page has one. */
export function injectNoindex(html: string): string {
  if (!html.includes('</head>') || /<meta\s+name="robots"/i.test(html))
    return html
  return html.replace('</head>', '  <meta name="robots" content="noindex">\n</head>')
}

export const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Extract the page's existing <title> text for og:title / twitter:title. */
function extractTitle(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i)
  return m?.[1]?.trim() || 'Bench Review'
}

/**
 * Escape a JSON-LD payload for safe embedding in a <script> element.
 *
 * JSON.stringify does not escape `<`, so a `</script>` sequence appearing in
 * any string value would close the block early and drop the rest of the page
 * into the document as markup. Descriptions here are ours, but this runs over
 * page titles too, and the whole point of the file is that untrusted-ish text
 * reaches the <head>. Escaping the `<` of a closing tag is the standard fix
 * and leaves the JSON semantically identical.
 */
export const escapeJsonLd = (value: unknown): string =>
  JSON.stringify(value).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\u003C!--')

/**
 * The site-wide JSON-LD graph, plus a WebPage node for this specific page.
 *
 * Structured data is what search engines read to build rich results; without
 * it a review directory is just prose to them. The shape is the conventional
 * three-node graph — Organization (who publishes), WebSite (the property, with
 * a SearchAction so a sitelinks search box can point at /search), and WebPage
 * (this page, tied back to the site by @id).
 *
 * Per-judge Review / Person nodes belong on the judge pages, which aren't
 * pre-rendered yet (#46) — they'd need build-time static generation to be
 * visible to a crawler that doesn't run JS, exactly like the OG tags above.
 */
function buildJsonLd(seo: PageSeo, base: string, title: string): string {
  const url = `${base}${seo.path}`
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      'name': 'Bench Review',
      'url': `${base}/`,
      'logo': {
        '@type': 'ImageObject',
        'url': `${base}/images/bench/logo.png`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      'url': `${base}/`,
      'name': 'Bench Review',
      'publisher': { '@id': `${base}/#organization` },
      'potentialAction': {
        '@type': 'SearchAction',
        'target': {
          '@type': 'EntryPoint',
          'urlTemplate': `${base}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      'name': title,
      'description': seo.description,
      'isPartOf': { '@id': `${base}/#website` },
    },
  ]

  return `<script type="application/ld+json">${escapeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`
}

/**
 * Inject canonical + OG + Twitter + description + JSON-LD into one page's
 * <head>. Returns the rewritten HTML (or the original if it has no </head>).
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
    buildJsonLd(seo, base, title),
  ].join('\n  ')

  // Replace the (default) description with the per-page one if present,
  // otherwise add it. Then splice the canonical/OG block before </head>.
  // See the `literal` note in entitySeo.ts: extractTitle() pulls the page's
  // own <title> into og:title/twitter:title, and on any page whose title is
  // user-derived a `$'` there would splice the document into itself.
  const literal = (s: string): (() => string) => () => s

  let out = html
  const descTag = `<meta name="description" content="${escapeAttr(seo.description)}">`
  if (/<meta\s+name="description"[^>]*>/i.test(out))
    out = out.replace(/<meta\s+name="description"[^>]*>/i, literal(descTag))
  else
    out = out.replace('</head>', literal(`  ${descTag}\n</head>`))

  return out.replace('</head>', literal(`  ${tags}\n</head>`))
}
