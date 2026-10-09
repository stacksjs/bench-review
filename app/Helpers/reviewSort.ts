import { db } from '@stacksjs/database'
import { request } from '@stacksjs/router'

/**
 * Sort order for the public review lists (`/api/reviews` and
 * `/api/judges/:id/reviews`), read from `?sort=`.
 *
 *   - `recent`  (default) — newest first, `created_at desc`
 *   - `helpful`           — most "helpful" marks first
 *
 * Why this isn't just an `orderBy` swap: there is no denormalised like
 * counter on `judge_reviews`. The `judge_reviews_likes` pivot is the
 * single source of truth (see `app/Helpers/reviewLikes.ts`), so the
 * count only exists as an aggregate over another table — and our query
 * builder doesn't surface `.leftJoin()` on this path (the same
 * limitation `JudgeIndexAction` and `JudgeSearchAction` work around
 * with in-memory joins).
 *
 * The naive alternative — hydrate the page, then sort those rows by
 * `likes` in JS — is wrong, not just slow: it sorts WITHIN a page that
 * was selected by date, so the most-liked review on the site never
 * reaches page 1 unless it happened to be recent. Ranking has to span
 * the whole scope before the page is cut, which is what `rankByHelpful`
 * does.
 */
export type ReviewSort = 'recent' | 'helpful'

/** Read `?sort=` off the active request. Anything unrecognised falls back to `recent`. */
export function resolveReviewSort(): ReviewSort {
  const raw = String((request as any).query?.sort ?? (request as any).get?.('sort') ?? '').trim().toLowerCase()
  return raw === 'helpful' ? 'helpful' : 'recent'
}

export interface RankCandidate {
  id: number | string
  created_at?: string | null
}

/**
 * Order an entire candidate scope by like count, descending.
 *
 * Takes the scope's `{ id, created_at }` rows (one cheap two-column
 * query the caller already needs for its `total`) and returns every id
 * in rank order, so the caller can slice its own page out of the
 * result. One grouped query against the pivot regardless of scope size.
 *
 * Ties break on `created_at desc`, then `id desc` — the vast majority
 * of reviews have zero likes, and without a deterministic tiebreak they
 * would come back in whatever order SQLite felt like, which makes
 * pagination drop and duplicate rows between pages.
 */
export async function rankByHelpful(candidates: RankCandidate[]): Promise<number[]> {
  const ids = candidates.map(c => Number(c.id)).filter(n => Number.isFinite(n) && n > 0)
  if (ids.length === 0)
    return []

  // Grouped count over the pivot. Rows with no likes don't come back at
  // all (inner join semantics) — they default to 0 below. `COUNT(*)` is
  // a plain string, not a `sql` tagged template: bun-query-builder joins
  // the select array with `.join(', ')` and a fragment object would
  // stringify to "[object Object]" (see reviewLikes.ts).
  const countRows = await (db.selectFrom('judge_reviews_likes') as any)
    .select(['judge_review_id', 'COUNT(*) as c'])
    .where('judge_review_id', 'in', ids as any)
    .groupBy('judge_review_id')
    .execute() as Array<{ judge_review_id: number, c: number | string }>

  const likes = new Map<number, number>()
  for (const r of countRows)
    likes.set(Number(r.judge_review_id), Number(r.c))

  const time = (value: string | null | undefined): number => {
    const t = Date.parse(String(value ?? ''))
    return Number.isNaN(t) ? 0 : t
  }

  return candidates
    .map(c => ({ id: Number(c.id), likes: likes.get(Number(c.id)) ?? 0, at: time(c.created_at) }))
    .filter(c => Number.isFinite(c.id) && c.id > 0)
    .sort((a, b) => (b.likes - a.likes) || (b.at - a.at) || (b.id - a.id))
    .map(c => c.id)
}

/**
 * Load full review rows for an already-ordered list of ids, preserving
 * that order. `WHERE id IN (…)` returns rows in whatever order the
 * engine likes, so the rank computed by {@link rankByHelpful} has to be
 * re-applied after the fetch or the page comes back shuffled.
 */
export async function fetchReviewsByIds(ids: number[]): Promise<Array<Record<string, any>>> {
  if (ids.length === 0)
    return []

  const rows = await (db.selectFrom('judge_reviews') as any)
    .selectAll()
    .where('id', 'in', ids as any)
    .execute() as Array<Record<string, any>>

  const byId = new Map<number, Record<string, any>>()
  for (const r of rows)
    byId.set(Number(r.id), r)

  return ids.map(id => byId.get(id)).filter(Boolean) as Array<Record<string, any>>
}
