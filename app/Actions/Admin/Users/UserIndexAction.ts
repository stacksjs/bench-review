import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'

/**
 * GET /api/admin/users — paginated user list for the admin UI.
 *
 * Query params:
 *   - q        : optional case-insensitive substring matched against
 *                `email` OR `name` (LIKE %q%)
 *   - page     : 1-indexed, default 1
 *   - perPage  : default 25, clamped to [1, 100]
 *
 * Roles are eager-loaded with a single JOIN against the
 * `user_roles` / `roles` pair (the same many-to-many shape declared
 * via `belongsToMany` on the User and Role models) and grouped by
 * `user_id` in memory. Cheaper than the previous per-row
 * `getUserRoles` fan-out by `O(N)` round-trips at the cost of one
 * SQL join over the visible page.
 */
export default new Action({
  name: 'Admin User Index',
  description: 'Paginated user list with role hydration for admin UI',
  method: 'GET',
  async handle() {
    const q = String((request as any).get?.('q') ?? '').trim()
    const pageRaw = Number((request as any).get?.('page') ?? 1)
    const perPageRaw = Number((request as any).get?.('perPage') ?? 25)
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const perPage = Math.min(100, Math.max(1, Number.isFinite(perPageRaw) ? Math.floor(perPageRaw) : 25))
    const offset = (page - 1) * perPage

    let listQuery: any = db.selectFrom('users' as any)
      .select(['id', 'email', 'name', 'created_at', 'updated_at'] as any)
      .orderBy('id' as any, 'desc')

    let countQuery: any = db.selectFrom('users' as any)
      .select(db.fn.count('id' as any).as('total') as any)

    if (q.length > 0) {
      const like = `%${q}%`
      listQuery = listQuery
        .where((eb: any) => eb.or([
          eb('email', 'like', like),
          eb('name', 'like', like),
        ]))
      countQuery = countQuery
        .where((eb: any) => eb.or([
          eb('email', 'like', like),
          eb('name', 'like', like),
        ]))
    }

    const [rows, totalRow] = await Promise.all([
      listQuery.limit(perPage).offset(offset).execute(),
      countQuery.executeTakeFirst(),
    ])

    const userRows = rows as Array<any>
    const userIds = userRows.map(u => u.id) as number[]

    // Bulk role-hydration. One JOIN over the visible page rather than
    // N selects from `getUserRoles(u.id)`. If the page is empty, skip
    // the query entirely — `where('user_id', 'in', [])` produces a
    // dialect-specific syntax error in some Bun drivers.
    const rolesByUser = new Map<number, Array<{ id: number, name: string, guard_name: string }>>()
    if (userIds.length > 0) {
      const roleRows = await (db.selectFrom('user_roles' as any) as any)
        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
        .select('user_roles.user_id as user_id')
        .select('roles.id as id')
        .select('roles.name as name')
        .select('roles.guard_name as guard_name')
        .where('user_roles.user_id' as any, 'in', userIds as any)
        .execute() as Array<{ user_id: number, id: number, name: string, guard_name: string }>

      for (const r of roleRows) {
        const list = rolesByUser.get(r.user_id) ?? []
        list.push({ id: r.id, name: r.name, guard_name: r.guard_name })
        rolesByUser.set(r.user_id, list)
      }
    }

    const users = userRows.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      created_at: u.created_at,
      updated_at: u.updated_at,
      roles: rolesByUser.get(u.id) ?? [],
    }))

    const total = Number((totalRow as any)?.total ?? 0)

    return response.json({ users, total, page, perPage })
  },
})
