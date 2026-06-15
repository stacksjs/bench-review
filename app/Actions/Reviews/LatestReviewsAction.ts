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
 *   - DEFAULT (no `?limit`) → canonical paginator
 *     (`{ data, current_page, per_page, total, last_page,
 *     has_more_pages, ... }`). Defaults to page 1, per_page 20 when those
 *     params are absent, and respects `?page` / `?per_page` when sent.
 *     The public `/reviews` feed reads this form (`reviews` store
 *     `goToFeedPage`) for numbered pagination. Accepts an optional
 *     `?category=<practice_area>` to scope the page to one practice area
 *     (resolved via the judges table).
 *   - `?limit=N`            → raw array of the newest N (capped at 20).
 *     The home page strip and the court page read this form
 *     (`reviews` store `fetchLatest`). Opt-in via `?limit` only.
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
    // The canonical paginator is the DEFAULT response. Only the explicit
    // ?limit form returns the legacy raw array (home/court strips). This
    // way hitting /api/reviews with no params still yields a sensible
    // page — page 1, per_page 20 — rather than requiring the client to
    // always send page/per_page.
    const hasLimit = (request.query?.limit ?? request.get?.('limit')) != null
    if (!hasLimit) {
      const { perPage, page, offset } = resolvePaginatorArgs({ defaultPerPage: 20 })

      // Optional server-side practice-area filter (the /reviews sidebar).
      // Reviews don't carry practice_area — it lives on the judge — so we
      // resolve the matching judge ids first, then scope reviews by
      // judge_id. Doing this server-side keeps page sizes consistent;
      // a client-side filter on top of a server page would produce
      // variable/empty pages under numbered pagination.
      const category = String(request.query?.category ?? request.get?.('category') ?? '').trim()
      let judgeIds: number[] | null = null
      if (category) {
        const jrows = await (db.selectFrom('judges') as any)
          .select(['id'])
          .where('practice_area', '=', category)
          .execute() as Array<{ id: number | string }>
        judgeIds = jrows.map(r => Number(r.id))
        // No judges in this category → empty page (skip the IN () query,
        // which some drivers reject for an empty list).
        if (judgeIds.length === 0)
          return response.json(buildPaginatorMeta([], 0, page, perPage))
      }

      let countQ = (db.selectFrom('judge_reviews') as any)
        .select(['COUNT(*) as c'])
        .where('status', '=', 'published')
      if (judgeIds)
        countQ = countQ.where('judge_id', 'in', judgeIds)
      const countRow = await countQ.executeTakeFirst() as { c: number | string } | undefined
      const total = Number(countRow?.c ?? 0)

      let dataQ = (db.selectFrom('judge_reviews') as any)
        .selectAll()
        .where('status', '=', 'published')
      if (judgeIds)
        dataQ = dataQ.where('judge_id', 'in', judgeIds)
      const rows = await dataQ
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
