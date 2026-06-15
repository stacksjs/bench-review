import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { hydrateLikeData } from '../../Helpers/reviewLikes'
import { buildPaginatorMeta, resolvePaginatorArgs } from '../../Helpers/paginate'

/**
 * GET /api/reviews — latest published reviews across all judges.
 *
 * Two response shapes, selected by the query string:
 *
 *   - `?limit=N`            → raw array of the newest N (capped at 20).
 *     The home page strip and the court page read this form
 *     (`reviews` store `fetchLatest`). Unchanged for back-compat.
 *   - `?page=N&per_page=M`  → canonical paginator
 *     (`{ data, current_page, per_page, total, last_page,
 *     has_more_pages, ... }`). The public `/reviews` feed reads this
 *     form (`reviews` store `fetchFeed` / `loadMoreFeed`) so it can
 *     page past the old hard cap of 20 via load-more.
 *
 * Published only — pending/rejected stay invisible to the public.
 * Hydrates `liked_by_me` per row when the request carries auth so the
 * cards paint the filled "helpful" state on first paint without a
 * follow-up round-trip.
 *
 * NOTE on the backend path: we go through `db.selectFrom` + the
 * `buildPaginatorMeta` shim rather than `JudgeReview.paginate()` because
 * bun-query-builder's `.paginate()` throws a parameter-binding error
 * ("SQLite query expected N values, received N-1") the moment a WHERE
 * clause is present — and this query always filters `status='published'`.
 * See `app/Helpers/paginate.ts` for the umbrella context.
 */
const MAX_LIMIT = 20
const DEFAULT_LIMIT = 6

export default new Action({
  name: 'Latest Reviews',
  description: 'Latest published reviews across all judges',
  method: 'GET',
  async handle() {
    const hasPage = (request.query?.page ?? request.get?.('page')) != null
    const hasPerPage = (request.query?.per_page ?? request.get?.('per_page')) != null

    // Paginated feed path.
    if (hasPage || hasPerPage) {
      const { perPage, page, offset } = resolvePaginatorArgs({ perPage: 10 })

      const countRow = await (db.selectFrom('judge_reviews') as any)
        .select(['COUNT(*) as c'])
        .where('status', '=', 'published')
        .executeTakeFirst() as { c: number | string } | undefined
      const total = Number(countRow?.c ?? 0)

      const rows = await (db.selectFrom('judge_reviews') as any)
        .selectAll()
        .where('status', '=', 'published')
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset(offset)
        .execute() as Array<Record<string, any>>

      const hydrated = await hydrateLikeData(rows ?? [])
      return response.json(buildPaginatorMeta(hydrated, total, page, perPage))
    }

    // Legacy capped-array path (home/court strips).
    const raw = request.query?.limit ?? request.get?.('limit')
    const parsed = Number(raw)
    const limit = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_LIMIT)
      : DEFAULT_LIMIT

    const rows = await JudgeReview.where('status', 'published')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get()

    const hydrated = await hydrateLikeData(rows ?? [])
    return response.json(hydrated)
  },
})
