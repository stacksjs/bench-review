import { db } from '@stacksjs/database'

/**
 * Everything keyed to a user, in one place, so the two deletion paths cannot
 * drift apart.
 *
 * They had. Self-serve account deletion cleaned 21 tables; the admin delete
 * cleaned 6, leaving that user's comments, likes, flags, review photos, drafts,
 * notification preferences, subscriptions and payment rows behind, still
 * pointing at an id that no longer exists. Whether a user's data is actually
 * erased should not depend on who pressed the button.
 */
export const USER_OWNED_TABLES: readonly string[] = [
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

/**
 * Delete every row this user owns, across both the `user_id` convention and the
 * two tables that don't follow it.
 *
 * Best-effort per table (`.catch`) so a table missing on a fresh checkout makes
 * the delete a no-op rather than 500-ing the request — but note that the same
 * swallow is what hid a real bug for as long as it existed: the actor-side
 * cleanup targeted `notifications.actor_user_id`, and that column lives on
 * `user_notifications`. Every call threw, every throw was caught, and the
 * notifications this user generated for OTHER people survived erasure.
 */
export async function deleteUserOwnedRows(userId: number): Promise<void> {
  for (const table of USER_OWNED_TABLES)
    await db.deleteFrom(table as any).where('user_id', '=', userId).execute().catch(() => {})

  // Notifications this user generated for others (actor side). The column is on
  // user_notifications — `notifications` has no actor_user_id at all.
  await db.deleteFrom('user_notifications' as any)
    .where('actor_user_id', '=', userId)
    .execute()
    .catch(() => {})

  // Polymorphic table, keyed by tokenable_id rather than user_id.
  await db.deleteFrom('personal_access_tokens' as any)
    .where('tokenable_id', '=', userId)
    .execute()
    .catch(() => {})
}
