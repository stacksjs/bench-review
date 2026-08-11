import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { verifyHash } from '@stacksjs/security'
import { schema } from '@stacksjs/validation'
import { deleteUserOwnedRows } from '../../Helpers/userCascade'

/**
 * DELETE /api/me — the authenticated user permanently deletes their own
 * account and all associated data (privacy-policy / right-to-erasure).
 *
 * Requires password confirmation — this is irreversible. Mirrors the admin
 * DeleteUserAction cascade but covers the full set of user-owned tables
 * (content, auth tokens, RBAC pivots, billing, notifications). Each delete
 * is best-effort so a missing/empty table on a given env can't wedge the
 * teardown; the users row goes last.
 */

// Every table keyed by `user_id` that holds this user's data. Ordered
// children-before-parent isn't required (no FK constraints in SQLite here),
// but we still delete the users row last so a mid-cascade failure leaves the
// account recoverable rather than orphaning rows under a deleted user.

export default new Action({
  name: 'Delete My Account',
  description: 'Permanently delete the authenticated user and all their data',
  method: 'DELETE',
  validations: {
    password: {
      rule: schema.string(),
      message: 'Password confirmation is required.',
    },
  },

  async handle() {
    const me = await Auth.user()
    const userId = (me as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated.' }, 401)

    const id = Number(userId)

    // Password confirmation — irreversible action, don't let a stolen/stale
    // token nuke an account without re-proving identity.
    const password = String(request.get?.('password') ?? '')
    const row = await db.selectFrom('users')
      .select(['password'])
      .where('id', '=', id)
      .executeTakeFirst() as { password: string } | undefined
    if (!row)
      return response.json({ error: 'Account not found.' }, 404)
    const ok = await verifyHash(password, row.password).catch(() => false)
    if (!ok)
      return response.json({ error: 'Password is incorrect.' }, 422)

    // Shared with the admin delete path so the two can't drift — see
    // app/Helpers/userCascade.ts.
    await deleteUserOwnedRows(id)

    // The account row last.
    await db.deleteFrom('users').where('id', '=', id).execute()

    return response.json({ ok: true })
  },
})
