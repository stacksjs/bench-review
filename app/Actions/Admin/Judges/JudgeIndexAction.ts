import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/judges — the admin directory list (bench-review#50).
 *
 * Search, status filter and paging, plus the two things a moderator needs in
 * order to act: the courthouse (the only way to tell two same-name judges
 * apart) and a review count (what a merge or a status change would affect).
 */
const PER_PAGE_MAX = 100

export default new Action({
  name: 'Admin Judge Index',
  description: 'List judges for the admin directory, with search and paging',
  method: 'GET',

  async handle() {
    const q = String(request.get?.('q') ?? '').trim().slice(0, 120)
    const status = String(request.get?.('status') ?? '').trim().toLowerCase()
    const page = Math.max(1, Number(request.get?.('page') ?? 1) || 1)
    const perPage = Math.min(PER_PAGE_MAX, Math.max(1, Number(request.get?.('perPage') ?? 25) || 25))

    // Built per branch rather than by mutating one builder: bqb's chained
    // wheres are easier to get wrong than to read, and this list is short.
    const applyFilters = (qb: any): any => {
      let out = qb
      if (q)
        out = out.where('name', 'like', `%${q}%`)
      if (status && status !== 'all')
        out = out.where('status', '=', status)
      return out
    }

    const countRow = await applyFilters(
      db.selectFrom('judges').select(['COUNT(*) as total' as any]),
    ).executeTakeFirst() as { total: number } | undefined
    const total = Number(countRow?.total ?? 0)

    const rows = await applyFilters(db.selectFrom('judges').select([
      'id',
      'name',
      'slug',
      'status',
      'jurisdiction',
      'state',
      'practice_area',
      'appointed_year',
      'external_id',
      'court_house_id',
      'image_url',
    ]))
      .orderBy('name', 'asc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .execute() as Array<Record<string, any>>

    // Courthouse names and review counts for the page only — resolving them
    // for the whole table would be 2,740 rows to render 25.
    const courtIds = [...new Set(rows.map(r => Number(r.court_house_id)).filter(Boolean))]
    const courtById = new Map<number, string>()
    if (courtIds.length) {
      const courts = await db.selectFrom('court_houses')
        .select(['id', 'name'])
        .where('id', 'in', courtIds as any)
        .execute() as Array<{ id: number, name: string }>
      for (const c of courts) courtById.set(Number(c.id), c.name)
    }

    const judgeIds = rows.map(r => Number(r.id))
    const reviewCount = new Map<number, number>()
    if (judgeIds.length) {
      const counts = await db.selectFrom('judge_reviews')
        .select(['judge_id', 'COUNT(*) as total' as any])
        .where('judge_id', 'in', judgeIds as any)
        .groupBy('judge_id')
        .execute() as Array<{ judge_id: number, total: number }>
      for (const c of counts) reviewCount.set(Number(c.judge_id), Number(c.total))
    }

    return response.json({
      judges: rows.map(r => ({
        ...r,
        court_house: r.court_house_id ? { id: r.court_house_id, name: courtById.get(Number(r.court_house_id)) ?? '(unknown court)' } : null,
        review_count: reviewCount.get(Number(r.id)) ?? 0,
      })),
      total,
      page,
      perPage,
    })
  },
})
