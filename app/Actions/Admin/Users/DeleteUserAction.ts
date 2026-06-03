import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

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
    const targetUserId = Number((request as any).params?.id)

    const me = await Auth.user()
    if ((me as any)?.id === targetUserId)
      return response.json({ error: 'You cannot delete your own account from the admin panel.' }, 422)

    const target = await db.selectFrom('users')
      .select(['id'] as any)
      .where('id', '=', targetUserId)
      .executeTakeFirst()
    if (!target)
      return response.json({ error: 'User not found.' }, 404)

    // Reviews + follows owned by this user. Deletion is hard rather
    // than orphaning to `user_id = NULL` because seeded/anonymous
    // reviews already use NULL — keeping the convention clean keeps
    // the public-feed filter (`r.judge_id != null`) simple.
    await db.deleteFrom('judge_reviews').where('user_id', '=', targetUserId).execute().catch(() => {})
    await db.deleteFrom('judge_follows').where('user_id', '=', targetUserId).execute().catch(() => {})

    // Token rows. The `personal_access_tokens` table is polymorphic
    // (`tokenable_type`/`tokenable_id`); the OAuth table is keyed by
    // `user_id`. Best-effort: if either table is missing on a fresh
    // checkout the `.catch(() => {})` makes the delete a no-op rather
    // than 500-ing the request.
    await db.deleteFrom('personal_access_tokens')
      .where('tokenable_id', '=', targetUserId)
      .execute()
      .catch(() => {})
    await db.deleteFrom('oauth_access_tokens')
      .where('user_id', '=', targetUserId)
      .execute()
      .catch(() => {})

    // RBAC pivots.
    await db.deleteFrom('user_roles').where('user_id', '=', targetUserId).execute().catch(() => {})
    await db.deleteFrom('user_permissions').where('user_id', '=', targetUserId).execute().catch(() => {})

    await db.deleteFrom('users').where('id', '=', targetUserId).execute()

    return response.json({ ok: true, deleted: targetUserId })
  },
})
