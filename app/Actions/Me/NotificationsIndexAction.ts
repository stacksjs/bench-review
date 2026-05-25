import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/me/notifications — current user's notification feed.
 *
 * Query:
 *   - filter : 'all' | 'unread', default 'all'
 *   - limit  : default 30, clamped to [1, 100]
 *
 * Each row is hydrated with:
 *   - actor: { id, name } or null for system-generated
 *   - review: { id, title } or null when the target review is gone
 *
 * Unread-count is included in the same response so the header bell
 * doesn't need a separate call. The bell renders the badge directly
 * off this field on every refresh.
 */
export default new Action({
  name: 'My Notifications',
  description: 'Current authenticated user notification feed + unread count',
  method: 'GET',
  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const filter = String((request as any).get?.('filter') ?? 'all').toLowerCase()
    const limitRaw = Number((request as any).get?.('limit') ?? 30)
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 30))

    let listQuery: any = db.selectFrom('user_notifications' as any)
      .selectAll()
      .where('user_id' as any, '=', userId)

    if (filter === 'unread')
      listQuery = listQuery.where('read_at' as any, 'is', null)

    listQuery = listQuery.orderBy('created_at' as any, 'desc').limit(limit)

    const rows = await listQuery.execute() as Array<{
      id: number
      user_id: number
      actor_user_id: number | null
      type: string
      review_id: number | null
      read_at: string | null
      created_at: string
    }>

    // Bulk hydrate actor + review in two queries (N+1 collapse).
    const actorIds = Array.from(new Set(rows.map(r => r.actor_user_id).filter((v): v is number => v != null)))
    const reviewIds = Array.from(new Set(rows.map(r => r.review_id).filter((v): v is number => v != null)))

    const [actors, reviews] = await Promise.all([
      actorIds.length === 0
        ? Promise.resolve([] as Array<{ id: number, name: string }>)
        : db.selectFrom('users' as any).select(['id', 'name'] as any).where('id' as any, 'in', actorIds as any).execute() as Promise<Array<{ id: number, name: string }>>,
      reviewIds.length === 0
        ? Promise.resolve([] as Array<{ id: number, title: string }>)
        : db.selectFrom('judge_reviews' as any).select(['id', 'title'] as any).where('id' as any, 'in', reviewIds as any).execute() as Promise<Array<{ id: number, title: string }>>,
    ])

    const actorById = new Map<number, { id: number, name: string }>()
    for (const a of actors) actorById.set(a.id, a)
    const reviewById = new Map<number, { id: number, title: string }>()
    for (const r of reviews) reviewById.set(r.id, r)

    const items = rows.map(r => ({
      id: r.id,
      type: r.type,
      created_at: r.created_at,
      read_at: r.read_at,
      unread: r.read_at == null,
      actor: r.actor_user_id != null ? actorById.get(r.actor_user_id) ?? null : null,
      review: r.review_id != null ? reviewById.get(r.review_id) ?? null : null,
    }))

    // Unread count — independent of the filter so the bell badge
    // stays accurate even when the user is viewing only unread.
    const unreadRow = await (db.selectFrom('user_notifications' as any) as any)
      .select(['COUNT(*) as c'] as any)
      .where('user_id' as any, '=', userId)
      .where('read_at' as any, 'is', null)
      .executeTakeFirst() as { c: number | string } | undefined
    const unreadCount = Number(unreadRow?.c ?? 0)

    return response.json({ items, unread_count: unreadCount })
  },
})
