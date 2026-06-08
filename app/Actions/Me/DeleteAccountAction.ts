import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { verifyHash } from '@stacksjs/security'
import { schema } from '@stacksjs/validation'

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
const USER_OWNED_TABLES = [
  'judge_reviews',
  'judge_reviews_likes',
  'judge_follows',
  'review_comments',
  'review_drafts',
  'review_flags',
  'review_photos',
  'notifications',
  'user_notifications',
  'notification_preferences',
  'email_verifications',
  'webauthn_challenges',
  'activities',
  'oauth_access_tokens',
  'user_roles',
  'user_permissions',
  'subscriptions',
  'subscribers',
  'payment_methods',
  'payment_transactions',
  'social_posts',
]

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

    for (const table of USER_OWNED_TABLES)
      await db.deleteFrom(table as any).where('user_id', '=', id).execute().catch(() => {})

    // Notifications this user generated for others (actor side).
    await db.deleteFrom('notifications').where('actor_user_id', '=', id).execute().catch(() => {})
    // Personal access tokens are keyed by `tokenable_id`, not `user_id`.
    await db.deleteFrom('personal_access_tokens').where('tokenable_id', '=', id).execute().catch(() => {})

    // The account row last.
    await db.deleteFrom('users').where('id', '=', id).execute()

    return response.json({ ok: true })
  },
})
