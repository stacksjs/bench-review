import { Action } from '@stacksjs/actions'
import { assignRole, Auth, getUserRoles, removeRole } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { bootRbac } from '../../../Helpers/rbac'

/**
 * POST /api/admin/users/{id}/role — assign or remove a role on a user.
 *
 * Body:
 *   - role   : role name (we only support 'admin' in this UI; the
 *              schema is open so the framework's `dev` / `client`
 *              roles can be wired in later without an action change)
 *   - action : 'assign' | 'remove'
 *
 * Guards against self-demotion. Without that guard, an admin who
 * accidentally removed their own admin role would be locked out and
 * the only recovery would be running `AdminUserSeeder.ts` from a
 * shell. Two admins demoting each other simultaneously is still a
 * theoretical lockout window, but two-admin orgs are the exception
 * and the recovery path is documented.
 */
export default new Action({
  name: 'Admin Toggle Role',
  description: 'Assign or remove a role on a user',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    bootRbac()

    const targetUserId = Number(request.params?.id)
    const role = String(request.get?.('role') ?? '').trim()
    const op = String(request.get?.('action') ?? '').trim()

    if (!role)
      return response.json({ error: 'Role is required.' }, 422)
    if (op !== 'assign' && op !== 'remove')
      return response.json({ error: 'Action must be "assign" or "remove".' }, 422)

    const target = await db.selectFrom('users')
      .select(['id'])
      .where('id', '=', targetUserId)
      .executeTakeFirst()
    if (!target)
      return response.json({ error: 'User not found.' }, 404)

    // Self-demotion guard: the currently-authenticated admin cannot
    // remove their OWN admin role. Other admins still can — that's
    // the deliberate escape hatch.
    if (op === 'remove' && role === 'admin') {
      const me = await Auth.user()
      if ((me as any)?.id === targetUserId)
        return response.json({ error: 'You cannot remove your own admin role.' }, 422)
    }

    if (op === 'assign')
      await assignRole(targetUserId, role)
    else
      await removeRole(targetUserId, role)

    const roles = await getUserRoles(targetUserId)

    return response.json({
      ok: true,
      user_id: targetUserId,
      roles: roles.map(r => ({ id: r.id, name: r.name, guard_name: r.guard_name })),
    })
  },
})
