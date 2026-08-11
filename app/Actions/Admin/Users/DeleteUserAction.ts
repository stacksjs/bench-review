import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'
import { logModeration } from '../../../Helpers/auditLog'
import { deleteUserOwnedRows } from '../../../Helpers/userCascade'

/**
 * DELETE /api/admin/users/{id} — hard-delete a user and their owned
 * rows.
 *
 * Manual cascade (the project's migrations are FK-free, matching the
 * Stacks convention of app-layer integrity):
 *   - judge_reviews where user_id = id
 *   - judge_follows where user_id = id
 *   - personal_access_tokens where tokenable_id = id
 *   - oauth_access_tokens where user_id = id
 *   - user_roles where user_id = id
 *   - user_permissions where user_id = id
 *   - users row itself
 *
 * Order matters only for foreign-row cleanup, not for correctness —
 * we delete leaves first so a partial failure leaves the user row
 * intact and a retry can still complete. SQLite doesn't give us a
 * cheap cross-table transaction wrapper at this layer; if any step
 * throws, callers retry.
 *
 * Self-deletion is blocked. An admin who deletes themselves is at
 * minimum locked out; at worst they delete the only admin row in
 * the system. Force them to demote-then-delete-via-another-admin if
 * they really need to disappear.
 */
export default new Action({
  name: 'Admin Delete User',
  description: 'Hard-delete a user and cascade their owned rows',
  method: 'DELETE',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    const targetUserId = Number(request.params?.id)

    const me = await Auth.user()
    if ((me as any)?.id === targetUserId)
      return response.json({ error: 'You cannot delete your own account from the admin panel.' }, 422)

    const target = await db.selectFrom('users')
      .select(['id', 'email'])
      .where('id', '=', targetUserId)
      .executeTakeFirst() as { id: number, email: string | null } | undefined
    if (!target)
      return response.json({ error: 'User not found.' }, 404)

    // Reviews + follows owned by this user. Deletion is hard rather
    // than orphaning to `user_id = NULL` because seeded/anonymous
    // reviews already use NULL — keeping the convention clean keeps
    // the public-feed filter (`r.judge_id != null`) simple.
    // Same cascade as the self-serve delete. This path used to clean only
    // judge_reviews, judge_follows, the two token tables and the RBAC pivots —
    // leaving the user's comments, likes, flags, review photos, drafts,
    // notification preferences, subscriptions and payment rows pointing at an
    // id that no longer existed. Whether a user's data is really erased should
    // not depend on who pressed the button.
    await deleteUserOwnedRows(targetUserId)

    await db.deleteFrom('users').where('id', '=', targetUserId).execute()

    if ((me as any)?.id)
      await logModeration({
        actorUserId: Number((me as any).id),
        action: 'user.delete',
        targetType: 'user',
        targetId: targetUserId,
        note: target.email ? `Deleted account: ${target.email}` : null,
      })

    return response.json({ ok: true, deleted: targetUserId })
  },
})
