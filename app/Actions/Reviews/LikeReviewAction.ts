import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
import { db } from '@stacksjs/database'
import { request, response } from '@stacksjs/router'
import { schema } from '@stacksjs/validation'

/**
 * POST /api/reviews/{id}/like — toggle the current user's "people find
 * this helpful" reaction on a review.
 *
 * Toggle semantics (not "always-like"):
 *   - Not yet liked → INSERT into judge_reviews_likes, return { liked: true, likes: n+1 }
 *   - Already liked → DELETE from judge_reviews_likes,  return { liked: false, likes: n-1 }
 *
 * Auth-gated for two reasons:
 *   1. Anonymous click-fraud would let a single user spam the counter
 *      by reloading. The `(user_id, judge_review_id)` UNIQUE index makes
 *      a user's "like" a single bit, not a tally.
 *   2. The counter UI ("123 people find this helpful") only carries
 *      weight if those are real accounts.
 *
 * The likes pivot table is the source of truth. We also keep the
 * denormalised `judge_reviews.likes` integer column in lock-step so
 * the public feed (`LatestReviewsAction`, `ReviewsByJudgeAction`) can
 * render the count without a per-row COUNT(*) join. Two writes per
 * toggle is cheap and the read fan-out savings dominate.
 */
export default new Action({
  name: 'Like Review',
  description: 'Toggle the current user\'s helpful reaction on a review',
  method: 'POST',
  validations: {
    id: {
      rule: schema.number().positive(),
      message: 'Invalid review id.',
    },
  },

  async handle() {
    const authUser = await Auth.user()
    const userId = (authUser as any)?.id
    if (!userId)
      return response.json({ error: 'Not authenticated' }, 401)

    const reviewId = Number((request as any).params?.id)

    // Verify the review actually exists (and is published — anonymous
    // POSTs to /api/reviews/9999/like should 404, not silently insert
    // an orphan pivot row).
    const review = await JudgeReview.where('id', reviewId)
      .where('status', 'published')
      .first()
    if (!review)
      return response.json({ error: 'Review not found' }, 404)

    // Authors can't react to their own work. The client UI already
    // hides the button on own-rows, but a hand-rolled POST shouldn't
    // be able to inflate the counter. 422 (semantic conflict) rather
    // than 403 — the request is well-formed and authenticated, it
    // just can't be honored.
    const authorId = (review as any).user_id
    if (authorId != null && Number(authorId) === Number(userId))
      return response.json({ error: 'You cannot mark your own review as helpful.' }, 422)

    const likeable = (JudgeReview as any)._likeable
    if (!likeable) {
      // Hard fail rather than silently degrade — if the trait didn't
      // wire up, every subsequent like would no-op and we'd ship a
      // broken feature without any signal.
      throw new Error('[LikeReviewAction] JudgeReview._likeable is unavailable — check `likeable: true` trait on the model')
    }

    const alreadyLiked = await likeable.isLiked(reviewId, userId)
    let liked: boolean
    if (alreadyLiked) {
      await likeable.unlike(reviewId, userId)
      liked = false
    }
    else {
      await likeable.like(reviewId, userId)
      liked = true
    }

    // Resync the denormalised counter from the source of truth. A
    // COUNT(*) over `(judge_review_id = N)` is index-friendly and
    // keeps us safe from drift if a race causes a like/unlike
    // mid-toggle on another tab.
    const fresh = await likeable.likeCount(reviewId)
    await db.updateTable('judge_reviews' as any)
      .set({ likes: fresh, updated_at: new Date().toISOString() } as any)
      .where('id' as any, '=', reviewId)
      .execute()

    return response.json({ liked, likes: fresh })
  },
})
