import { Action } from '@stacksjs/actions'
import { getUserRoles } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { bootRbac } from '../../../Helpers/rbac'

/**
 * GET /api/admin/users — paginated user list for the admin UI.
 *
 * Query params:
 *   - q        : optional case-insensitive substring matched against
 *                `email` OR `name` (LIKE %q%)
 *   - page     : 1-indexed, default 1
 *   - perPage  : default 25, clamped to [1, 100]
 *
 * Each user is hydrated with its role names via `getUserRoles(id)` so
 * the table can show "admin"/"client" badges and the promote/demote
 * action knows the current state without a follow-up roundtrip.
 *
 * The roles fan-out is N+1 in the worst case (one query per row, plus
 * the page query). At the project's expected scale (tens to low
 * thousands of users) that's fine. Swap to a single JOIN on
 * `user_roles` + `roles` when it becomes hot.
 */
export default new Action({
  name: 'Admin User Index',
  description: 'Paginated user list with role hydration for admin UI',
  method: 'GET',
  async handle() {
    bootRbac()

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

    const users = await Promise.all((rows as Array<any>).map(async (u) => {
      const roles = await getUserRoles(u.id)
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        created_at: u.created_at,
        updated_at: u.updated_at,
        roles: roles.map(r => ({ id: r.id, name: r.name, guard_name: r.guard_name })),
      }
    }))

    const total = Number((totalRow as any)?.total ?? 0)

    return response.json({ users, total, page, perPage })
  },
})
