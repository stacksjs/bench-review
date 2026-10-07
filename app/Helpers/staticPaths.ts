/**
 * Build-time path enumeration for stx's SSG `getStaticPaths()` hook.
 *
 * Why this exists: bench's sitemap advertised 29 dynamic URLs — every judge
 * profile, every courthouse, every published review — and the build emitted a
 * file for none of them. preview.ts (and any static host doing the same
 * pretty-URL mapping) resolves /judges/1/profile to dist/judges/1/profile.html,
 * finds nothing, and serves 404.html with a 404 status. So the entire content
 * corpus of a review directory 404'd in production while being advertised to
 * crawlers as canonical.
 *
 * Why the odd calling convention: stx's SSG extracts the getStaticPaths body
 * with a regex and evaluates it through `new Function`, so the body has no
 * module scope — no imports, no top-level bindings — and the regex terminates
 * at the first line whose first non-whitespace character is `}`. Both rule out
 * writing real logic inline. Each template therefore carries a two-line body
 * that dynamic-imports this file by absolute path and returns one of these
 * functions, keeping every closing brace off the start of a line.
 */
import { db } from '@stacksjs/database'

interface StaticPath { params: Record<string, string> }
interface StaticPathsResult { paths: StaticPath[] }

const toPaths = (rows: Array<{ id: number }>): StaticPathsResult =>
  ({ paths: rows.map(r => ({ params: { id: String(r.id) } })) })

/**
 * ONE shell page shared by every judge, for the tab routes.
 *
 * Enumerating /judges/:id/{profile,reviews,rulings,cases} per judge meant four
 * pages × 2,740 judges, and with the other per-judge routes the SSG reached
 * 20,028 pages and died with "Out of memory" partway through — taking
 * sitemap.xml, the SEO injection and the CSP down with it.
 *
 * These views do not actually need a page per judge: `Bench/Judge/JudgeTabs`
 * and each panel already resolve the judge from `location.pathname`
 * (`/^\/judges\/(\d+)/`) rather than from a build-time param, precisely
 * because stx leaves `window.stx._rp` unset on a hard reload. So one shell per
 * tab renders identically for every judge once hydrated, and `preview.ts`
 * rewrites /judges/:id/reviews onto /judges/_shell/reviews.html.
 *
 * `_shell` is deliberately not a number: judge ids are numeric, so it can
 * never collide with a real /judges/:id/... URL.
 */
export function judgeShellPath(): StaticPathsResult {
  return { paths: [{ params: { id: '_shell' } }] }
}

/**
 * ONE shell page shared by every courthouse, for the tab routes.
 *
 * Same shape as judgeShellPath, and the same reasoning: /court-houses/:id/
 * {profile,bench,reviews} was 3 pages x 202 courthouses = 606 built files,
 * roughly 143 MB of dist/, none of which held anything a shared shell cannot
 * render. Bench/Court/{CourtTabs,CourtHeader,CourtProfile} resolve the
 * courthouse from useRoute().params with a path fallback, so one shell per tab
 * serves all 202 once hydrated, and preview.ts rewrites
 * /court-houses/:id/<tab> onto /court-houses/_shell/<tab>.html.
 *
 * The per-courthouse head moves with it: entitySeo now writes the real title,
 * description and CivicStructure node to court-houses/<id>.html, the canonical
 * page the sitemap advertises, because a shell serving 202 courthouses cannot
 * carry a per-courthouse head. Skipping that step is how all 2,740 judge pages
 * ended up sharing one generic title.
 *
 * `_shell` is deliberately not a number: courthouse ids are numeric, so it can
 * never collide with a real /court-houses/:id/... URL.
 */
export function courtShellPath(): StaticPathsResult {
  return { paths: [{ params: { id: '_shell' } }] }
}

/** Every judge — drives /judges/:id/{profile,reviews,rulings,cases}. */
export async function judgePaths(): Promise<StaticPathsResult> {
  const rows = await ((db.selectFrom('judges') as any)
    .select(['id'])
    .execute() as Promise<Array<{ id: number }>>)
  return toPaths(rows)
}

/** Every courthouse — drives /court-houses/:id/{profile,bench,reviews}. */
export async function courtPaths(): Promise<StaticPathsResult> {
  const rows = await ((db.selectFrom('court_houses') as any)
    .select(['id'])
    .execute() as Promise<Array<{ id: number }>>)
  return toPaths(rows)
}

/**
 * PUBLISHED reviews only — drives /article/:id.
 *
 * Same status filter the sitemap uses. Pending and rejected reviews must not
 * get a pre-rendered file: publishing one would put unmoderated content at a
 * crawlable URL, which is the exact failure mode moderation exists to prevent.
 */
export async function articlePaths(): Promise<StaticPathsResult> {
  const rows = await ((db.selectFrom('judge_reviews') as any)
    .select(['id'])
    .where('status', '=', 'published')
    .execute() as Promise<Array<{ id: number }>>)
  return toPaths(rows)
}

/** Blog posts — content lives in a static module, not the database. */
export async function blogPaths(): Promise<StaticPathsResult> {
  const { blogPosts } = await import('../../resources/data/sample')
  return toPaths((blogPosts as Array<{ id: number }>).map(p => ({ id: p.id })))
}

/**
 * Public reviewer profiles.
 *
 * Deliberately NOT "every user". A file per registered account turns the
 * deploy into a user-enumeration oracle — anyone listing dist/ learns how many
 * accounts exist and their ids. Only authors who have already published a
 * NON-anonymous review get a page, because that identity is public by their
 * own choice; it's the same set the app is willing to link to (the feed guards
 * every /user/ link on a non-zero author id).
 *
 * Returns empty against current seed data, where published reviews carry no
 * user_id. That's the correct output, not a failure — it grows on its own once
 * reviews are attributed.
 */
export async function reviewerPaths(): Promise<StaticPathsResult> {
  const rows = await ((db.selectFrom('judge_reviews') as any)
    .select(['user_id', 'anonymized'])
    .where('status', '=', 'published')
    .execute() as Promise<Array<{ user_id: number | null, anonymized: number | null }>>)
  const ids = [...new Set(rows.filter(r => r.user_id != null && !r.anonymized).map(r => Number(r.user_id)))]
  return toPaths(ids.map(id => ({ id })))
}
