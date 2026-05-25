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

    // Build the WHERE first, then ORDER BY / LIMIT / OFFSET. bqb's
    // SELECT builder emits clauses in CHAIN-CALL ORDER, not canonical
    // SQL order — `.orderBy(...).where(...)` produces
    // `... ORDER BY ... WHERE ...` which SQLite rejects with
    // `near "WHERE": syntax error`. Apply the search filter before
    // the ordering call so the chain matches the canonical layout.
    let listQuery: any = db.selectFrom('users' as any)
      .select(['id', 'email', 'name', 'created_at', 'updated_at'] as any)

    // Plain-string `'COUNT(*) as total'` rather than `db.fn.count(...)` —
    // the current bqb version exposes no `db.fn` namespace. The literal
    // carries no user input so it's safe to interpolate. Matches the
    // count pattern in `app/Helpers/reviewLikes.ts:hydrateLikeData`.
    let countQuery: any = db.selectFrom('users' as any)
      .select(['COUNT(*) as total'] as any)

    if (q.length > 0) {
      // bqb doesn't expose a Kysely-style callback `where(eb => eb.or([…]))` —
      // the form is silently no-op'd. Use `where().orWhere()` instead.
      const like = `%${q}%`
      listQuery = listQuery.where('email', 'like', like).orWhere('name', 'like', like)
      countQuery = countQuery.where('email', 'like', like).orWhere('name', 'like', like)
    }

    listQuery = listQuery.orderBy('id' as any, 'desc')

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
      // bqb's `innerJoin` is FOUR-arg (`table, onLeft, op, onRight`) —
      // the `'='` is not optional. And chained `.select(string)` calls
      // REPLACE the SELECT clause each time; array-form packs the
      // whole column list into a single call so all selections survive.
      // Same fix that landed upstream in rbac-store-bqb (see
      // stacksjs/stacks `fix(rbac): correct bqb API misuse`).
      const roleRows = await (db.selectFrom('user_roles' as any) as any)
        .innerJoin('roles', 'roles.id', '=', 'user_roles.role_id')
        .select([
          'user_roles.user_id as user_id',
          'roles.id as id',
          'roles.name as name',
          'roles.guard_name as guard_name',
        ])
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
