import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { hydrateLikeData } from '../../Helpers/reviewLikes'
import { buildPaginatorMeta, resolvePaginatorArgs } from '../../Helpers/paginate'
import { toPublicReviewRow } from '../../Helpers/reviewerLabel'
import { fetchReviewsByIds, rankByHelpful, resolveReviewSort } from '../../Helpers/reviewSort'

/**
 * GET /api/judges/:id/reviews — paginated list of published reviews
 * for one judge.
 *
 * Returns the canonical paginator shape (see `app/Helpers/paginate.ts`):
 * `{ data, current_page, per_page, total, last_page, from, to,
 * has_more_pages, prev_page_url, next_page_url, first_page_url,
 * last_page_url, path }`.
 *
 * Lazy by design: the directory page (`/api/judges`) returns judges
 * WITHOUT review aggregates, and the judge profile pulls this endpoint
 * only when its reviews tab actually renders.
 *
 * Returns published reviews only — pending/rejected stay invisible to
 * the public. `liked_by_me` is hydrated per row when the request
 * carries an auth token.
 *
 * Pagination:
 *   - `?page=N`         — 1-indexed page (default 1)
 *   - `?per_page=M`     — clamped to [1, 100], default 25 (per the shim)
 *
 * Sorting:
 *   - `?sort=recent`    — newest first (default)
 *   - `?sort=helpful`   — most "helpful" marks first, ranked across every
 *                         published review for this judge before the page
 *                         is cut (see app/Helpers/reviewSort.ts)
 *
 * Resolves bench-review#28 (public read endpoints).
 */

/**
 * Fold a list of `{ rating }` rows into the canonical rating summary:
 * total count, average (1-decimal), and a 5→1 star distribution with
 * per-bucket counts + percentages. Computed over the full published
 * set so the profile header stays correct as the list paginates.
 */
function buildRatingSummary(
  ratingRows: Array<{ rating: number | string }>,
  total: number,
): { total: number, average: number, distribution: Array<{ stars: number, count: number, percentage: number }> } {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const r of ratingRows) {
    const v = Number(r.rating) || 0
    sum += v
    const bucket = Math.round(v)
    if (bucket >= 1 && bucket <= 5)
      counts[bucket]++
  }
  const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0
  const distribution = [5, 4, 3, 2, 1].map(stars => ({
    stars,
    count: counts[stars] ?? 0,
    percentage: total > 0 ? Math.round(((counts[stars] ?? 0) / total) * 100) : 0,
  }))
  return { total, average, distribution }
}

export default new Action({
  name: 'Reviews By Judge',
  description: 'Paginated published reviews for a single judge',
  method: 'GET',
  async handle() {
    const raw = String(request.params?.id || '')
    const judgeId = Number(raw)
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      return response.json({ error: 'Invalid judge id' }, 400)

    const { perPage, page, offset } = resolvePaginatorArgs({ defaultPerPage: 20 })

    // Use db.selectFrom directly because (a) the where + count chain
    // needs to be run on the same builder shape and (b) hydrateLikeData
    // expects raw rows. The model layer's chainable .count() / .paginate()
    // are not reliable in our vendored framework copy (see issue body).
    //
    // Pull every published rating in one tiny query (single int column)
    // so the summary aggregates (total + average + per-star
    // distribution) reflect ALL reviews, not just the current page.
    // Without this the profile's average/distribution would only cover
    // the loaded slice — a latent bug now that the list paginates via
    // load-more. Doubles as the paginator's `total`.
    //
    // `id` and `created_at` ride along on the same query because
    // `?sort=helpful` needs exactly this scope — every published review
    // for the judge — to rank against. The helpful path therefore adds
    // no scan the summary wasn't already paying for.
    const ratingRows = await (db.selectFrom('judge_reviews') as any)
      .select(['id', 'rating', 'created_at'])
      .where('judge_id', '=', judgeId)
      .where('status', '=', 'published')
      .execute() as Array<{ id: number, rating: number | string, created_at?: string | null }>
    const total = ratingRows.length
    const summary = buildRatingSummary(ratingRows, total)

    // Ranking spans the whole scope, not the page: sorting a date-selected
    // page by likes would leave the judge's most-marked review off page 1
    // unless it also happened to be recent.
    let rows: Array<Record<string, any>>
    if (resolveReviewSort() === 'helpful') {
      const ranked = await rankByHelpful(ratingRows)
      rows = await fetchReviewsByIds(ranked.slice(offset, offset + perPage))
    }
    else {
      rows = await (db.selectFrom('judge_reviews') as any)
        .selectAll()
        .where('judge_id', '=', judgeId)
        .where('status', '=', 'published')
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset(offset)
        .execute() as Array<Record<string, any>>
    }

    const hydrated = await hydrateLikeData(rows ?? [])
    // Strip raw user_id (de-anonymization guard); is_mine carries the
    // "my review" signal the client needs. See toPublicReviewRow.
    const me = await Auth.user().catch(() => null)
    const viewerId = (me as any)?.id ?? null
    const publicRows = hydrated.map(r => toPublicReviewRow(r, viewerId))
    return response.json({ ...buildPaginatorMeta(publicRows, total, page, perPage), summary })
  },
})
