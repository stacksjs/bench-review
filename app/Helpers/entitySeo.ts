/**
 * Per-ENTITY SEO for the pre-rendered dynamic pages.
 *
 * seoPages.ts covers the fixed routes from a hand-written table. That doesn't
 * scale to a judge profile per judge, so this builds the same head — title,
 * description, OG/Twitter, JSON-LD — from the database at build time.
 *
 * Structured data is the whole point for a directory like this. A `Review` node
 * with an `itemReviewed` Person and a `reviewRating` is what produces a rating
 * snippet in results; prose alone produces nothing. Everything here is emitted
 * only for content that is already public — see the anonymity note on
 * `articleAuthor` and the status filter in `loadEntitySeo`.
 */
import { db } from '@stacksjs/database'
import { escapeAttr, escapeJsonLd } from './seoPages'

export interface EntitySeo {
  /** Route path, e.g. /judges/3/profile. Canonical + og:url = base + this. */
  path: string
  title: string
  description: string
  /** Extra schema.org nodes for this page, merged into the site graph. */
  nodes: Array<Record<string, unknown>>
}

interface JudgeRow { id: number, name: string | null, image_url: string | null, practice_area: string | null, court_house_id: number | null }
interface CourtRow { id: number, name: string | null, image: string | null, address: string | null, city: string | null, state: string | null, zip_code: string | null }
export interface ReviewRow { id: number, title: string | null, content: string | null, rating: number | null, status: string | null, anonymized: number | null, judge_id: number | null, created_at: string | null }

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
}

/**
 * Decode the entities a rich-text editor actually emits.
 *
 * Blanking them instead (the obvious `&[a-z]+;` -> ' ') silently eats
 * punctuation: "Fair &amp; firm" becomes "Fair firm" and "he&rsquo;s" becomes
 * "he s". Apostrophes are near-universal in prose, so every description would
 * have carried a visible hole. Latent against current seed data, which happens
 * to contain no entities at all — which is exactly why it needed testing rather
 * than eyeballing.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
}

/** Collapse HTML + whitespace to a meta-description-sized plain sentence. */
function excerpt(html: string | null, max = 155): string {
  // Decode AFTER stripping tags, so a decoded '<' can't reconstitute markup.
  const text = decodeEntities((html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  if (text.length <= max)
    return text
  // Cut at a word boundary so the snippet doesn't end mid-word.
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

/**
 * Replace with a literal string.
 *
 * String.prototype.replace treats `$&`, `$'`, `` $` `` and `$1` in the
 * REPLACEMENT as substitution patterns, and none of the HTML escaping here
 * touches `$` — escapeAttr covers & " < > only. A review titled
 * "Judge cost me $' in fees" therefore spliced the entire remainder of the
 * document into the <title>. Passing a function makes the return value literal,
 * which is the only safe way to put user-controlled text through replace().
 */
const literal = (s: string): (() => string) => () => s

const clean = (s: string | null, fallback: string): string => (s ?? '').trim() || fallback

/**
 * Reviews can be submitted anonymously, and that choice has to survive into
 * structured data. Emitting a real author name here would leak it to every
 * crawler and aggregator in a machine-readable field — the same de-anonymisation
 * this app already guards against elsewhere. Anonymous reviews get an anonymous
 * author node, never the user record.
 */
export const articleAuthor = (r: ReviewRow): Record<string, unknown> =>
  r.anonymized ? { '@type': 'Person', 'name': 'Anonymous' } : { '@type': 'Organization', 'name': 'Bench Review contributor' }

export async function loadEntitySeo(base: string): Promise<Map<string, EntitySeo>> {
  const [judges, courts, reviews] = await Promise.all([
    (db.selectFrom('judges') as any).select(['id', 'name', 'image_url', 'practice_area', 'court_house_id']).execute() as Promise<JudgeRow[]>,
    (db.selectFrom('court_houses') as any).select(['id', 'name', 'image', 'address', 'city', 'state', 'zip_code']).execute() as Promise<CourtRow[]>,
    (db.selectFrom('judge_reviews') as any).select(['id', 'title', 'content', 'rating', 'status', 'anonymized', 'judge_id', 'created_at']).execute() as Promise<ReviewRow[]>,
  ])

  const courtById = new Map(courts.map(c => [c.id, c]))
  // Ratings aggregate over PUBLISHED reviews only. Including pending or
  // rejected ones would publish a score derived from unmoderated content.
  const published = reviews.filter(r => r.status === 'published')
  const byJudge = new Map<number, ReviewRow[]>()
  for (const r of published) {
    if (r.judge_id == null)
      continue
    const list = byJudge.get(r.judge_id) ?? []
    list.push(r)
    byJudge.set(r.judge_id, list)
  }

  const out = new Map<string, EntitySeo>()
  const put = (file: string, seo: EntitySeo): void => void out.set(file, seo)

  // ── Judges ──────────────────────────────────────────────────────────
  for (const j of judges) {
    const name = clean(j.name, `Judge #${j.id}`)
    const court = j.court_house_id != null ? courtById.get(j.court_house_id) : undefined
    const courtName = clean(court?.name ?? null, '')
    const where = courtName ? ` of ${courtName}` : ''
    const mine = byJudge.get(j.id) ?? []
    const rated = mine.filter(r => typeof r.rating === 'number' && r.rating > 0)
    const avg = rated.length ? rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length : 0

    const person: Record<string, unknown> = {
      '@type': 'Person',
      '@id': `${base}/judges/${j.id}/profile#person`,
      'name': name,
      'jobTitle': 'Judge',
      'url': `${base}/judges/${j.id}/profile`,
    }
    if (j.image_url) person.image = j.image_url
    if (courtName) person.affiliation = { '@type': 'Organization', 'name': courtName }
    if (j.practice_area) person.knowsAbout = j.practice_area
    if (rated.length) {
      person.aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': Math.round(avg * 10) / 10,
        'reviewCount': rated.length,
        'bestRating': 5,
        'worstRating': 1,
      }
    }

    const count = mine.length
    const counted = count === 1 ? '1 review' : `${count} reviews`
    const base_ = `${name}${where}.`
    const tabs: Array<[string, string, string]> = [
      ['profile', `${name}${where} — Judge Profile`, `${base_} Read ${counted} from the attorneys, clerks, and court staff who have appeared before them.`],
      ['reviews', `Reviews of ${name}`, `${counted} of ${name}${where} on Bench Review — first-hand accounts of courtroom conduct, temperament, and fairness.`],
      ['rulings', `Rulings by ${name}`, `Recent rulings and decisions attributed to ${name}${where}.`],
      ['cases', `Cases before ${name}`, `Cases heard by ${name}${where}, as reported by Bench Review contributors.`],
    ]
    for (const [tab, title, description] of tabs) {
      put(`judges/${j.id}/${tab}.html`, {
        path: `/judges/${j.id}/${tab}`,
        title: `${title} | Bench Review`,
        description,
        // Only the canonical profile tab claims the Person node, so the same
        // @id isn't asserted with different content on four URLs.
        nodes: tab === 'profile' ? [person] : [],
      })
    }
  }

  // ── Courthouses ─────────────────────────────────────────────────────
  for (const c of courts) {
    const name = clean(c.name, `Courthouse #${c.id}`)
    const locality = [c.city, c.state].filter(Boolean).join(', ')
    const at = locality ? ` in ${locality}` : ''
    const bench = judges.filter(j => j.court_house_id === c.id)

    const place: Record<string, unknown> = {
      '@type': 'CivicStructure',
      '@id': `${base}/court-houses/${c.id}/profile#place`,
      'name': name,
      'url': `${base}/court-houses/${c.id}/profile`,
    }
    if (c.image) place.image = c.image
    if (c.address || locality || c.zip_code) {
      place.address = {
        '@type': 'PostalAddress',
        ...(c.address ? { streetAddress: c.address } : {}),
        ...(c.city ? { addressLocality: c.city } : {}),
        ...(c.state ? { addressRegion: c.state } : {}),
        ...(c.zip_code ? { postalCode: c.zip_code } : {}),
        addressCountry: 'US',
      }
    }

    const tabs: Array<[string, string, string]> = [
      ['profile', `${name}${at}`, `${name}${at} — address, the judges who sit there, and reviews from the people who appear before them.`],
      ['bench', `Judges of ${name}`, `The ${bench.length === 1 ? 'judge' : 'judges'} sitting at ${name}${at}${bench.length ? ` (${bench.length})` : ''}.`],
      ['reviews', `Reviews at ${name}`, `Reviews of judges sitting at ${name}${at}, from attorneys, clerks, and court staff.`],
    ]
    for (const [tab, title, description] of tabs) {
      put(`court-houses/${c.id}/${tab}.html`, {
        path: `/court-houses/${c.id}/${tab}`,
        title: `${title} | Bench Review`,
        description,
        nodes: tab === 'profile' ? [place] : [],
      })
    }
  }

  // ── Review articles (published only) ────────────────────────────────
  const judgeById = new Map(judges.map(j => [j.id, j]))
  for (const r of published) {
    const judge = r.judge_id != null ? judgeById.get(r.judge_id) : undefined
    const judgeName = clean(judge?.name ?? null, 'a judge')
    const title = clean(r.title, `Review of ${judgeName}`)
    const body = excerpt(r.content)
    const review: Record<string, unknown> = {
      '@type': 'Review',
      '@id': `${base}/article/${r.id}#review`,
      'url': `${base}/article/${r.id}`,
      'name': title,
      'author': articleAuthor(r),
      'itemReviewed': judge
        ? { '@type': 'Person', '@id': `${base}/judges/${judge.id}/profile#person`, 'name': judgeName }
        : { '@type': 'Person', 'name': judgeName },
      'publisher': { '@id': `${base}/#organization` },
    }
    if (r.created_at) review.datePublished = new Date(r.created_at).toISOString().slice(0, 10)
    if (typeof r.rating === 'number' && r.rating > 0) {
      review.reviewRating = { '@type': 'Rating', 'ratingValue': r.rating, 'bestRating': 5, 'worstRating': 1 }
    }

    put(`article/${r.id}.html`, {
      path: `/article/${r.id}`,
      title: `${title} | Bench Review`,
      description: body || `A review of ${judgeName} on Bench Review.`,
      nodes: [review],
    })
  }

  return out
}

/**
 * Splice one entity's head in: title, description, canonical, OG/Twitter, and
 * a JSON-LD graph carrying the entity nodes alongside the site's WebPage node.
 */
export function injectEntitySeo(html: string, seo: EntitySeo, base: string): string {
  if (!html.includes('</head>'))
    return html

  const url = `${base}${seo.path}`
  const ogImage = `${base}/images/og-image.png`
  const graph = [
    ...seo.nodes,
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      'name': seo.title,
      'description': seo.description,
      'isPartOf': { '@id': `${base}/#website` },
    },
  ]

  let out = html

  // The SSG emits a generic per-route title ("Judge Profile - Bench Review")
  // for every entity on that route; replace it with the entity's own.
  if (/<title>[\s\S]*?<\/title>/i.test(out))
    out = out.replace(/<title>[\s\S]*?<\/title>/i, literal(`<title>${escapeAttr(seo.title)}</title>`))

  const descTag = `<meta name="description" content="${escapeAttr(seo.description)}">`
  if (/<meta\s+name="description"[^>]*>/i.test(out))
    out = out.replace(/<meta\s+name="description"[^>]*>/i, literal(descTag))
  else
    out = out.replace('</head>', literal(`  ${descTag}\n</head>`))

  const tags = [
    ...(out.includes('rel="canonical"') ? [] : [`<link rel="canonical" href="${escapeAttr(url)}">`]),
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Bench Review">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    `<meta property="og:title" content="${escapeAttr(seo.title)}">`,
    `<meta property="og:description" content="${escapeAttr(seo.description)}">`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttr(seo.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(seo.description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`,
    `<script type="application/ld+json">${escapeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`,
  ].join('\n  ')

  return out.replace('</head>', literal(`  ${tags}\n</head>`))
}
