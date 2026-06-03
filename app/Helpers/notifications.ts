import { db } from '@stacksjs/database'

export type NotificationType = 'like' | 'approved' | 'rejected'

interface DispatchInput {
  userId: number
  actorUserId?: number | null
  type: NotificationType
  reviewId?: number | null
}

/**
 * Drop an in-app notification into a user's feed.
 *
 * Caller responsibility:
 *   - Self-actor filtering. We deliberately DON'T short-circuit when
 *     `actorUserId === userId` — review-status changes legitimately
 *     notify the same user, even if the admin happens to be the
 *     author (an edge case but harmless). Like-self-filtering is
 *     enforced at the LikeReviewAction layer (server 422s on
 *     own-like), so it never reaches here.
 *
 *   - Like dedup. Calling `notify(...)` twice for the same
 *     (user_id, actor_user_id, 'like', review_id) tuple would insert
 *     two rows; we collapse on the actor+target+type so unlike-then-
 *     re-like doesn't spam the recipient. Approve/reject don't dedup
 *     — every state change is an event worth surfacing.
 *
 * Errors are swallowed: a missed notification is annoying but should
 * never break the user-visible action (the like, the moderation
 * change). Logged so they're discoverable.
 */
export async function notify(input: DispatchInput): Promise<void> {
  const { userId, actorUserId, type, reviewId } = input

  if (!Number.isFinite(userId) || userId <= 0) return

  try {
    if (type === 'like') {
      // Dedup: skip if an unread or recent-read like notification
      // already exists for this exact (recipient, actor, review).
      // Without this, like → unlike → like floods the feed.
      const existing = await db.selectFrom('user_notifications')
        .select(['id'])
        .where('user_id', '=', userId)
        .where('actor_user_id', '=', actorUserId ?? null)
        .where('type', '=', 'like')
        .where('review_id', '=', reviewId ?? null)
        .executeTakeFirst()
      if (existing) return
    }

    await db.insertInto('user_notifications').values({
      user_id: userId,
      actor_user_id: actorUserId ?? null,
      type,
      review_id: reviewId ?? null,
      created_at: new Date().toISOString(),
    } as any).execute()
  }
  catch (err) {
    console.warn('[notify] dispatch failed:', err instanceof Error ? err.message : err)
  }
}
