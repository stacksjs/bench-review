/**
 * Site identity — the single source of truth for who this app says it is.
 *
 * Matches the convention used across the hq-apps fleet (analyticshq, bughq,
 * commshq, loghq, reportshq, statushq): one root-level `site.config.ts` that
 * owns the name, the canonical URL, and the SEO defaults, so the same strings
 * stop being retyped in four places.
 *
 * Before this file, bench-review's identity lived in three places that could
 * (and did) drift:
 *   - `stx.config.ts` → `app.head.title` + the default meta description
 *   - `app/Helpers/seoPages.ts` → the JSON-LD Organization / WebSite nodes,
 *     which hardcoded 'Bench Review' three times and the logo path once
 *   - `app/Helpers/sitemap.ts` → the fallback base URL
 * All three now read from here. The one thing that stays in the environment is
 * the *build-time* base URL (`APP_URL`), because it legitimately differs per
 * environment — `url` below is the production canonical, used as the fallback
 * when APP_URL is unset.
 *
 * NOTE: the framework does not auto-load this file (verified: nothing in the
 * hq-apps imports their own `site.config.ts` either — it is a convention, not
 * a hook). Consumers import it explicitly via the `~/site.config` alias.
 */

export interface SiteSeo {
  /** Brand name as it appears in structured data and og:site_name. */
  siteName: string
  /** Default <title> for pages that don't set their own. */
  title: string
  /** Default meta description. */
  description: string
  /** Absolute URL to the default social-share image. */
  image: string
  /** Site-root-relative path to the same image, for `${base}`-prefixed use. */
  imagePath: string
  /** Favicon path, relative to the site root. */
  favicon: string
  /** og:locale. */
  locale: string
  /** og:type for the site as a whole. */
  type: string
  /** Absolute-path logo used by the JSON-LD Organization node. */
  logo: string
}

export interface SiteConfig {
  name: string
  url: string
  description: string
  seo: SiteSeo
  /** Reserved for per-page overrides; bench keeps those in app/Helpers/seoPages.ts. */
  pages: Record<string, unknown>
}

const description = 'Bench Review is a public directory of judges where attorneys, clerks, and court staff share first-hand reviews. Search judges by name and court.'

const url = 'https://benchreview.org'

export default {
  name: 'Bench Review',
  url,
  description,
  seo: {
    siteName: 'Bench Review',
    title: 'Bench Review: Read and Write Reviews of Judges',
    description,
    // Both of these resolve to files that actually exist under public/ —
    // validate-release.ts fails the build on a referenced asset that 404s.
    image: `${url}/images/og-image.png`,
    imagePath: '/images/og-image.png',
    favicon: '/favicon.svg',
    locale: 'en_US',
    type: 'website',
    logo: '/images/bench/logo.png',
  },
  pages: {},
} satisfies SiteConfig
