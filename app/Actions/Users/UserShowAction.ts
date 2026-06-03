import { Action } from '@stacksjs/actions'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * GET /api/users/{id} — public-safe user payload for the reviewer
 * profile page (bench-review#29).
 *
 * Returns only fields safe to expose to anonymous readers:
 *   - id, name, created_at  → identity + tenure
 *   - aggregates (review_count, judges_reviewed, total_likes, avg_rating)
 *     computed over PUBLISHED reviews only — pending/rejected stay
 *     private to the author and admin.
 *
 * Deliberately NOT returned: email, password (obviously), role
 * memberships, follow lists, last-login timestamp, anything from
 * personal_access_tokens. The public-safe split is enforced HERE,
 * not by the view — never trust the client to filter PII.
 *
 * 404s for missing users in the same shape as a "real" not-found, so
 * a guessed-id probe can't distinguish "exists but private" from
 * "doesn't exist."
 */
export default new Action({
  name: 'User Show',
  description: 'Public-safe reviewer profile payload + aggregates over published reviews',
  method: 'GET',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid user id.',
    },
  },

  async handle() {
    const userId = Number(request.params?.id)

    const user = await db.selectFrom('users')
      .select(['id', 'name', 'created_at', 'credential_type', 'credential_state', 'credential_verified_at'])
      .where('id', '=', userId)
      .executeTakeFirst() as {
        id: number
        name: string
        created_at: string | null
        credential_type: string | null
        credential_state: string | null
        credential_verified_at: string | null
      } | undefined

    if (!user)
      return response.json({ error: 'User not found' }, 404)

    // Verified-credential surface (bench-review#37). Only the
    // PUBLIC-SAFE bits leak — type label + state + a boolean. The
    // claim timestamp, admin-id, rejection note, and proof-storage
    // path all stay private to the user themselves + admins. A
    // future "view this reviewer's credential proof" feature for
    // logged-in users would need an explicit consent flow.
    const verified = user.credential_verified_at != null
    const credential = verified
      ? {
          type: user.credential_type,
          state: user.credential_state,
          verified: true,
        }
      : null

    // Aggregates over the user's published reviews, split into three
    // narrow queries because (a) bqb's `.select([...])` string-column
    // form chokes on `COUNT(DISTINCT col)` at the prepare step and
    // (b) `likes` is a count on the `judge_reviews_likes` pivot
    // table, not a column on `judge_reviews` itself (we moved it
    // there earlier so the counter isn't a denormalized field that
    // drifts). Three small queries is fine at the scale we care
    // about; revisit if a user has 10k+ reviews.
    const agg = await (db.selectFrom('judge_reviews') as any)
      .select([
        'COUNT(*) as review_count',
        'AVG(rating) as avg_rating',
      ])
      .where('user_id', '=', userId)
      .where('status', '=', 'published')
      .where('anonymized', '=', 0)
      .executeTakeFirst() as { review_count: number | string, avg_rating: number | string | null } | undefined

    const distinctRows = await (db.selectFrom('judge_reviews') as any)
      .select(['judge_id'])
      .where('user_id', '=', userId)
      .where('status', '=', 'published')
      .where('anonymized', '=', 0)
      .groupBy('judge_id')
      .execute() as Array<{ judge_id: number }>

    // Total likes — JOIN the pivot against the user's published reviews.
    const likesRow = await (db.selectFrom('judge_reviews_likes') as any)
      .innerJoin('judge_reviews' as any, 'judge_reviews.id', '=', 'judge_reviews_likes.judge_review_id')
      .select(['COUNT(*) as c'])
      .where('judge_reviews.user_id', '=', userId)
      .where('judge_reviews.status', '=', 'published')
      .where('judge_reviews.anonymized', '=', 0)
      .executeTakeFirst() as { c: number | string } | undefined

    const reviewCount = Number(agg?.review_count ?? 0)
    const judgesReviewed = distinctRows.length
    const totalLikes = Number(likesRow?.c ?? 0)
    const avgRating = agg?.avg_rating == null
      ? null
      : Math.round(Number(agg.avg_rating) * 10) / 10

    return response.json({
      id: user.id,
      name: user.name,
      created_at: user.created_at,
      review_count: reviewCount,
      judges_reviewed: judgesReviewed,
      total_likes: totalLikes,
      avg_rating: avgRating,
      credential,
    })
  },
})
