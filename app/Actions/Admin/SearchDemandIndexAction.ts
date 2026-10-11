import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/search-demand — what people searched the judge directory
 * for, ranked by how often.
 *
 * Defaults to the queries that found NOTHING, because that is the actionable
 * list: each one is somebody who came looking for a judge bench does not
 * have. `?all=1` includes the queries that did return judges, which is the
 * view you want when deciding whether a zero-result query is a missing judge
 * or a misspelling of one already in the directory.
 *
 * Rows carry no searcher — see app/Helpers/searchDemand.ts. There is nothing
 * here to attribute to a person, which is why this endpoint can be a plain
 * admin list rather than something access-logged.
 *
 * bench-review#57.
 */
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 200

export default new Action({
  name: 'Admin Search Demand',
  description: 'Judge-directory searches ranked by demand, zero-result first',
  method: 'GET',
  async handle() {
    const all = String(request.query?.all ?? request.get?.('all') ?? '') === '1'
    const rawLimit = Number(request.query?.limit ?? request.get?.('limit') ?? DEFAULT_LIMIT)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT

    let q = (db.selectFrom('judge_search_queries') as any)
      .select(['id', 'query', 'searches', 'last_result_count', 'created_at', 'updated_at'])
    if (!all)
      q = q.where('last_result_count', '=', 0)

    const rows = await q
      // Demand first, then recency — a query five people ran last month
      // matters more than one somebody ran this morning.
      .orderBy('searches', 'desc')
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .execute() as Array<Record<string, any>>

    // Distinct zero-result queries overall, so the dashboard can show the
    // size of the backlog without pulling the whole list.
    const missingRow = await (db.selectFrom('judge_search_queries') as any)
      .select(['COUNT(*) as c'])
      .where('last_result_count', '=', 0)
      .executeTakeFirst() as { c: number | string } | undefined

    return response.json({
      ok: true,
      queries: rows.map(r => ({
        id: Number(r.id),
        query: String(r.query ?? ''),
        searches: Number(r.searches ?? 0),
        last_result_count: Number(r.last_result_count ?? 0),
        first_seen_at: r.created_at ?? null,
        last_seen_at: r.updated_at ?? null,
      })),
      missing_total: Number(missingRow?.c ?? 0),
    })
  },
})
