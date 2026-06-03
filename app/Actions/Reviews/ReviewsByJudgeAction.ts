import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { hydrateLikeData } from '../../Helpers/reviewLikes'
import { buildPaginatorMeta, resolvePaginatorArgs } from '../../Helpers/paginate'

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
 * Resolves bench-review#28 (public read endpoints).
 */
export default new Action({
  name: 'Reviews By Judge',
  description: 'Paginated published reviews for a single judge',
  method: 'GET',
  async handle() {
    const raw = String(request.params?.id || '')
    const judgeId = Number(raw)
    if (!Number.isFinite(judgeId) || judgeId <= 0)
      return response.json({ error: 'Invalid judge id' }, 400)

    const { perPage, page, offset } = resolvePaginatorArgs()

    // Use db.selectFrom directly because (a) the where + count chain
    // needs to be run on the same builder shape and (b) hydrateLikeData
    // expects raw rows. The model layer's chainable .count() / .paginate()
    // are not reliable in our vendored framework copy (see issue body).
    const countRow = await (db.selectFrom('judge_reviews') as any)
      .select(['COUNT(*) as c'])
      .where('judge_id', '=', judgeId)
      .where('status', '=', 'published')
      .executeTakeFirst() as { c: number | string } | undefined
    const total = Number(countRow?.c ?? 0)

    const rows = await (db.selectFrom('judge_reviews') as any)
      .selectAll()
      .where('judge_id', '=', judgeId)
      .where('status', '=', 'published')
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute() as Array<Record<string, any>>

    const hydrated = await hydrateLikeData(rows ?? [])
    return response.json(buildPaginatorMeta(hydrated, total, page, perPage))
  },
})
