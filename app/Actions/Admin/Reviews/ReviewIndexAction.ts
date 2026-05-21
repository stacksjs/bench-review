import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/reviews — paginated review list with status filter.
 *
 * Unlike the public `LatestReviewsAction` (which hardcodes
 * `.where('status', 'published')`), this surfaces every status so the
 * moderation queue actually has something to moderate.
 *
 * Query:
 *   - status   : 'all' | 'pending' | 'published' | 'rejected', default 'all'
 *   - q        : substring matched against `title` OR `content`
 *   - page, perPage : 1-indexed, 25 default, max 100
 *
 * Returns each row hydrated with `{ judge: { id, name }, user: { id, name, email } | null }`
 * so the admin table can show "Review of <Judge> by <Author>" without
 * an extra client-side join.
 */
const VALID_STATUS = new Set(['all', 'pending', 'published', 'rejected'])

export default new Action({
  name: 'Admin Review Index',
  description: 'Paginated review list for moderation',
  method: 'GET',
  async handle() {
    const statusInput = String((request as any).get?.('status') ?? 'all').toLowerCase()
    const status = VALID_STATUS.has(statusInput) ? statusInput : 'all'

    const q = String((request as any).get?.('q') ?? '').trim()

    const pageRaw = Number((request as any).get?.('page') ?? 1)
    const perPageRaw = Number((request as any).get?.('perPage') ?? 25)
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const perPage = Math.min(100, Math.max(1, Number.isFinite(perPageRaw) ? Math.floor(perPageRaw) : 25))
    const offset = (page - 1) * perPage

    let listQuery: any = db.selectFrom('judge_reviews' as any)
      .selectAll()
      .orderBy('created_at' as any, 'desc')

    let countQuery: any = db.selectFrom('judge_reviews' as any)
      .select(db.fn.count('id' as any).as('total') as any)

    if (status !== 'all') {
      listQuery = listQuery.where('status' as any, '=', status)
      countQuery = countQuery.where('status' as any, '=', status)
    }

    if (q.length > 0) {
      const like = `%${q}%`
      listQuery = listQuery.where((eb: any) => eb.or([
        eb('title', 'like', like),
        eb('content', 'like', like),
      ]))
      countQuery = countQuery.where((eb: any) => eb.or([
        eb('title', 'like', like),
        eb('content', 'like', like),
      ]))
    }

    const [rows, totalRow] = await Promise.all([
      listQuery.limit(perPage).offset(offset).execute(),
      countQuery.executeTakeFirst(),
    ])

    const reviewRows = rows as Array<any>
    const judgeIds = Array.from(new Set(reviewRows.map(r => r.judge_id).filter((id: any) => id != null))) as number[]
    const userIds = Array.from(new Set(reviewRows.map(r => r.user_id).filter((id: any) => id != null))) as number[]

    const [judges, users] = await Promise.all([
      judgeIds.length === 0
        ? Promise.resolve([] as any[])
        : db.selectFrom('judges' as any).select(['id', 'name'] as any).where('id' as any, 'in', judgeIds as any).execute(),
      userIds.length === 0
        ? Promise.resolve([] as any[])
        : db.selectFrom('users' as any).select(['id', 'name', 'email'] as any).where('id' as any, 'in', userIds as any).execute(),
    ])

    const judgeById = new Map<number, any>()
    for (const j of judges as any[]) judgeById.set(j.id, j)
    const userById = new Map<number, any>()
    for (const u of users as any[]) userById.set(u.id, u)

    const hydrated = reviewRows.map((r) => {
      const j = r.judge_id != null ? judgeById.get(r.judge_id) : null
      const u = r.user_id != null ? userById.get(r.user_id) : null
      return {
        id: r.id,
        title: r.title,
        content: r.content,
        rating: r.rating,
        status: r.status,
        type: r.type,
        likes: r.likes,
        comments: r.comments,
        created_at: r.created_at,
        updated_at: r.updated_at,
        judge: j ? { id: j.id, name: j.name } : { id: r.judge_id, name: '(unknown judge)' },
        user: u ? { id: u.id, name: u.name, email: u.email } : null,
      }
    })

    return response.json({
      reviews: hydrated,
      total: Number((totalRow as any)?.total ?? 0),
      page,
      perPage,
      status,
    })
  },
})
