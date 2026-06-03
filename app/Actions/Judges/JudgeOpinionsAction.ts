import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { buildPaginatorMeta, resolvePaginatorArgs } from '../../Helpers/paginate'

/**
 * GET /api/judges/{id}/opinions — recent published opinions for a judge.
 *
 * Public-safe; no auth gate. Reads from the local `judge_opinions`
 * cache populated either by an admin (manual entry) or by a future
 * automated refresh job pulling from CourtListener / PACER / state
 * docket sources. The render surface is the same either way — the
 * `source_provider` column distinguishes "moderator-curated" from
 * "fetched from X" so the future automated pipeline can identify
 * the rows it owns vs the ones to leave alone.
 *
 * Returns canonical paginator shape from app/Helpers/paginate.ts.
 * Default page size: 25. Ordered by decision_date DESC so the
 * newest opinion surfaces first.
 *
 * Resolves bench-review#39 (read half + architectural foundation).
 */
export default new Action({
  name: 'Judge Opinions',
  description: 'Paginated list of recent opinions for one judge',
  method: 'GET',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid judge id.',
    },
  },

  async handle() {
    const judgeId = Number((request as any).params?.id)
    const { perPage, page, offset } = resolvePaginatorArgs({ perPage: 25 })

    const countRow = await (db.selectFrom('judge_opinions') as any)
      .select(['COUNT(*) as c'])
      .where('judge_id', '=', judgeId)
      .executeTakeFirst() as { c: number | string } | undefined
    const total = Number(countRow?.c ?? 0)

    const rows = await (db.selectFrom('judge_opinions') as any)
      .select([
        'id', 'judge_id', 'case_name', 'citation', 'decision_date',
        'summary', 'outcome_label', 'source_url', 'source_provider',
        'created_at',
      ])
      .where('judge_id', '=', judgeId)
      .orderBy('decision_date', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute()

    return response.json(buildPaginatorMeta(rows ?? [], total, page, perPage))
  },
})
