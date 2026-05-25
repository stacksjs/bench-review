import { Action } from '@stacksjs/actions'
import { Auth } from '@stacksjs/auth'
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
 * The pivot table `judge_reviews_likes` is the single source of truth.
 * There is no denormalised counter — `likeCount()` reads the pivot
 * directly on every toggle to return the fresh count to the client.
 * Feed reads share the same pivot via `app/Helpers/reviewLikes.ts`'s
 * bulk GROUP BY.
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

    // Fresh count straight from the pivot. The composite UNIQUE on
    // `(judge_review_id, user_id)` means the COUNT(*) here is exact
    // even under concurrent toggles from other tabs.
    const fresh = await likeable.likeCount(reviewId)
    return response.json({ liked, likes: fresh })
  },
})
